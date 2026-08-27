import type { HomeSnapshot } from "@/lib/home/snapshot";
import type { Automation, SensorMetric } from "@/lib/home/types";
import { remoSync } from "@/lib/home/remo";
import { patchAlreadyApplied, patchFromAction, reportsActuatorState } from "@/lib/home/device-patch";
import { sensorHoldsWhileInRange, sensorTriggerDecision } from "@/lib/home/sensor-trigger";
import { switchbotRefreshSensors } from "@/lib/home/switchbot";
import { tuyaRefreshSensors } from "@/lib/home/tuya";
import { daikinConfigured, daikinSync } from "@/lib/home/daikin";
import { homeBelongsToLanOwner } from "./lan-owner";
import { listAutomationHomeIds, loadHomeRecord, saveHomeRecord } from "./home-db";
import { executeAction } from "./execute";
import { startBackupRunner } from "./home-backup";
import { billingConfigured, loadEntitlement } from "./billing";
import { clockInTokyo } from "@/lib/home/clock";
import { SENSOR_TICK_SECONDS } from "@/lib/home/control-tick";

let started = false;
let ticking = false;

function metricValue(
  device: { temperature?: number | null; humidity?: number | null; lux?: number | null },
  metric: SensorMetric,
) {
  if (metric === "temperature") return device.temperature;
  if (metric === "humidity") return device.humidity;
  return device.lux;
}

async function runAutomation(
  homeId: string,
  snap: HomeSnapshot,
  auto: Automation,
  opts?: { onlyIfDifferent?: boolean },
) {
  if (!auto.enabled || !auto.actions.length) return snap;
  let cur = snap;
  const onlyIfDifferent = opts?.onlyIfDifferent === true;
  for (const action of auto.actions) {
    if (onlyIfDifferent) {
      const device = action.deviceId ? cur.devices.find((d) => d.id === action.deviceId) : undefined;
      if (!device || !reportsActuatorState(device)) continue;
      if (patchAlreadyApplied(device, patchFromAction(action))) continue;
    }
    cur = await executeAction(homeId, cur, action);
  }
  return cur;
}

async function tickTime(homeId: string, snap: HomeSnapshot) {
  const now = clockInTokyo();
  const today = now.dayKey;
  const hour = now.hour;
  const minute = now.minute;
  const weekday = now.weekday;
  let cur = snap;
  for (const auto of cur.automations) {
    if (!auto.enabled || auto.trigger.type !== "time") continue;
    const t = auto.trigger;
    const repeat = t.repeat ?? "daily";
    if (repeat === "interval") {
      const ms = Math.max(1, t.everyHours ?? 1) * 60 * 60 * 1000;
      const last = Number(auto.lastFiredKey ?? 0);
      if (last && Date.now() - last < ms) continue;
      cur = await saveHomeRecord(homeId, {
        automations: cur.automations.map((a) =>
          a.id === auto.id ? { ...a, lastFiredKey: String(Date.now()) } : a,
        ),
      });
      cur = await runAutomation(homeId, cur, auto);
      continue;
    }
    if ((t.hour ?? 0) !== hour || (t.minute ?? 0) !== minute) continue;
    if (repeat === "weekly" && !(t.days ?? []).includes(weekday)) continue;
    const key = `${today}-${hour}-${minute}`;
    if (auto.lastFiredKey === key) continue;
    cur = await saveHomeRecord(homeId, {
      automations: cur.automations.map((a) => (a.id === auto.id ? { ...a, lastFiredKey: key } : a)),
    });
    cur = await runAutomation(homeId, cur, auto);
  }
  return cur;
}

async function tickSensors(homeId: string, snap: HomeSnapshot) {
  let cur = snap;
  const cred = cur.credentials.natureToken;
  if (cred.trim()) {
    try {
      const res = await remoSync(cred);
      cur = await saveHomeRecord(homeId, {
        climate: res.climate,
        devices: cur.devices.map((d) => {
          const live = res.devices.find((n) => n.id === d.id);
          return live ? { ...d, ...live, name: d.name, room: d.room } : d;
        }),
      });
    } catch {
      /* keep last */
    }
  }
  // LAN 直結は持ち主の家にだけ入れる。他人の家へ機器を配らない。
  if (daikinConfigured() && homeBelongsToLanOwner((await loadHomeRecord(homeId))?.ownerUserId ?? "")) {
    try {
      const res = await daikinSync();
      // 認証不要の env 直結なので、手動同期を待たず新規機器もここで取り込む。
      const incoming = new Map(res.devices.map((n) => [n.id, n]));
      const merged = cur.devices.map((d) => {
        const live = incoming.get(d.id);
        if (!live) return d;
        incoming.delete(d.id);
        return { ...d, ...live, name: d.name, room: d.room };
      });
      cur = await saveHomeRecord(homeId, { devices: [...merged, ...incoming.values()] });
    } catch {
      /* keep last */
    }
  }
  const sbToken = cur.credentials.switchbotToken;
  const sbSecret = cur.credentials.switchbotSecret;
  if (
    sbToken.trim() &&
    sbSecret.trim() &&
    cur.devices.some((d) => d.connector === "switchbot" && d.kind === "sensor")
  ) {
    try {
      const devices = cur.devices.map((d) => ({ ...d }));
      await switchbotRefreshSensors(sbToken, sbSecret, devices);
      cur = await saveHomeRecord(homeId, { devices });
    } catch {
      /* keep last */
    }
  }
  const tuya = cur.credentials;
  if (
    tuya.tuyaAccessId.trim() &&
    tuya.tuyaSecret.trim() &&
    tuya.tuyaRegion.trim() &&
    tuya.tuyaRegion !== "auto" &&
    cur.devices.some((d) => d.connector === "smartlife" && d.kind === "sensor")
  ) {
    try {
      const devices = cur.devices.map((d) => ({ ...d }));
      await tuyaRefreshSensors(tuya.tuyaAccessId, tuya.tuyaSecret, tuya.tuyaRegion, devices);
      cur = await saveHomeRecord(homeId, { devices });
    } catch {
      /* keep last */
    }
  }
  for (const auto of cur.automations) {
    if (!auto.enabled || auto.trigger.type !== "sensor") continue;
    const t = auto.trigger;
    const metric = t.metric ?? "temperature";
    const device = cur.devices.find((d) => d.id === t.deviceId);
    const raw = device ? metricValue(device, metric) : metricValue(cur.climate, metric);
    if (raw == null || t.value == null) continue;
    if (sensorHoldsWhileInRange(t) && t.valueMax == null) continue;
    const { pass, key } = sensorTriggerDecision(raw, t);
    if (sensorHoldsWhileInRange(t)) {
      if (pass) cur = await runAutomation(homeId, cur, auto, { onlyIfDifferent: true });
      continue;
    }
    if (auto.lastFiredKey === key) continue;
    cur = await saveHomeRecord(homeId, {
      automations: cur.automations.map((a) => (a.id === auto.id ? { ...a, lastFiredKey: key } : a)),
    });
    if (pass) cur = await runAutomation(homeId, cur, auto);
  }
  return cur;
}

export async function tickHome(homeId: string) {
  const rec = await loadHomeRecord(homeId);
  if (!rec) return;
  let snap = rec.snap;
  snap = await tickTime(homeId, snap);
  await tickSensors(homeId, snap);
}

/** Cloudflare Cron も同じ関数を呼ぶ。 */
export async function tickAllHomes() {
  if (ticking) return;
  ticking = true;
  try {
    for (const id of listAutomationHomeIds()) {
      try {
        const rec = await loadHomeRecord(id);
        if (!rec) continue;
        if (billingConfigured()) {
          const entitlement = await loadEntitlement(rec.ownerUserId);
          if (!entitlement.writable) continue;
        }
        await tickHome(id);
      } catch (err) {
        console.error("[yui] tick home failed", id, err);
      }
    }
  } finally {
    ticking = false;
  }
}

export function startControlRunner() {
  if (started) return;
  started = true;
  void tickAllHomes();
  setInterval(() => void tickAllHomes(), SENSOR_TICK_SECONDS * 1000);
  startBackupRunner();
}

export async function fireDeviceOnServer(homeId: string, deviceId: string, on?: boolean) {
  if (on === undefined) return;
  const rec = await loadHomeRecord(homeId);
  if (!rec) return;
  let cur = rec.snap;
  for (const auto of cur.automations) {
    if (!auto.enabled || auto.trigger.type !== "device") continue;
    if (auto.trigger.deviceId !== deviceId) continue;
    if (auto.trigger.deviceOn !== undefined && auto.trigger.deviceOn !== on) continue;
    cur = await runAutomation(homeId, cur, auto);
  }
}

export async function fireSceneOnServer(homeId: string, sceneId: string) {
  const rec = await loadHomeRecord(homeId);
  if (!rec) return;
  let cur = rec.snap;
  for (const auto of cur.automations) {
    if (!auto.enabled || auto.trigger.type !== "scene") continue;
    if (auto.trigger.sceneId !== sceneId) continue;
    cur = await runAutomation(homeId, cur, auto);
  }
}
