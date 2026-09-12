import type { HomeSnapshot } from "@/lib/home/snapshot";
import type { Automation } from "@/lib/home/types";
import type { AnalysisSource } from "@/lib/home/analysis-series";
import { remoSync } from "@/lib/home/remo";
import { patchFromAction, skipHeldRepeat } from "@/lib/home/device-patch";
import { collectMatchingAutomations, prioritizeAutomationActions, sensorCondition, skipContinuousActions } from "@/lib/home/automation-priority";
import { switchbotRefreshSensors } from "@/lib/home/switchbot";
import { tuyaRefreshSensors } from "@/lib/home/tuya";
import { daikinConfigured, daikinSync, isRetiredDaikinOutdoorId } from "@/lib/home/daikin";
import { heldSkipReason } from "@/lib/home/analysis-series";
import { homeBelongsToLanOwner } from "./lan-owner";
import { listAutomationHomeIds, loadHomeRecord, saveHomeRecord } from "./home-db";
import { executeAction } from "./execute";
import { startBackupRunner } from "./home-backup";
import { billingConfigured, loadEntitlement } from "./billing";
import { clockInTokyo } from "@/lib/home/clock";
import { SENSOR_TICK_SECONDS } from "@/lib/home/control-tick";
import { newWaveId, pruneAnalysis, recordEvent, recordHomeSamples } from "./analysis";

let started = false;
let ticking = false;

async function runAutomation(
  homeId: string,
  snap: HomeSnapshot,
  auto: Automation,
  opts: { onlyIfDifferent?: boolean; source: AnalysisSource; waveId: string },
) {
  if (!auto.enabled || !auto.actions.length) return snap;
  let cur = snap;
  const onlyIfDifferent = opts.onlyIfDifferent === true;
  let sent = false;
  const log = {
    source: opts.source,
    waveId: opts.waveId,
    automationId: auto.id,
    automationName: auto.name,
  };
  for (const action of auto.actions) {
    if (onlyIfDifferent) {
      const device = action.deviceId ? cur.devices.find((d) => d.id === action.deviceId) : undefined;
      if (!device) continue;
      if (skipHeldRepeat(device, patchFromAction(action))) {
        recordEvent({
          homeId,
          waveId: opts.waveId,
          source: opts.source,
          automationId: auto.id,
          automationName: auto.name,
          deviceId: device.id,
          deviceName: device.name,
          outcome: "skipped",
          reason: heldSkipReason(device),
        });
        continue;
      }
    }
    cur = await executeAction(homeId, cur, action, log);
    sent = true;
  }
  if (sent) cur = await saveHomeRecord(homeId, { lastRanAutomationId: auto.id });
  return cur;
}

function timeWouldRun(auto: Automation, now: ReturnType<typeof clockInTokyo>, nowMs: number): { run: boolean; key?: string } {
  if (!auto.enabled || auto.trigger.type !== "time") return { run: false };
  const t = auto.trigger;
  const repeat = t.repeat ?? "daily";
  if (repeat === "interval") {
    const ms = Math.max(1, t.everyHours ?? 1) * 60 * 60 * 1000;
    const last = Number(auto.lastFiredKey ?? 0);
    if (last && nowMs - last < ms) return { run: false };
    return { run: true, key: String(nowMs) };
  }
  if ((t.hour ?? 0) !== now.hour || (t.minute ?? 0) !== now.minute) return { run: false };
  if (repeat === "weekly" && !(t.days ?? []).includes(now.weekday)) return { run: false };
  const key = `${now.dayKey}-${now.hour}-${now.minute}`;
  if (auto.lastFiredKey === key) return { run: false };
  return { run: true, key };
}

function sensorWouldRun(
  auto: Automation,
  snap: HomeSnapshot,
): { run: boolean; holds: boolean; key?: string } {
  const d = sensorCondition(auto, snap);
  return { run: d.match, holds: d.holds, key: d.key };
}

async function runPrioritized(
  homeId: string,
  snap: HomeSnapshot,
  firing: Automation[],
  holds: Set<string>,
  source: AnalysisSource,
) {
  const waveId = newWaveId();
  let cur = snap;
  const lastRan = cur.lastRanAutomationId;
  const planned = prioritizeAutomationActions(firing);
  for (const auto of firing) {
    const current = cur.automations.find((a) => a.id === auto.id) ?? auto;
    const actions = planned.get(auto.id) ?? [];
    const kept = new Set(actions.map((a) => a.deviceId).filter(Boolean));
    for (const action of current.actions) {
      if (!action.deviceId || kept.has(action.deviceId)) continue;
      const device = cur.devices.find((d) => d.id === action.deviceId);
      const owner = firing.find((a) => (planned.get(a.id) ?? []).some((x) => x.deviceId === action.deviceId));
      recordEvent({
        homeId,
        waveId,
        source,
        automationId: current.id,
        automationName: current.name,
        deviceId: action.deviceId,
        deviceName: device?.name,
        outcome: "skipped",
        reason: "claimed_by",
        detail: owner ? JSON.stringify({ by: owner.id, name: owner.name }) : undefined,
      });
    }
    if (!actions.length) continue;
    if (skipContinuousActions(current, lastRan)) {
      for (const action of actions) {
        const device = cur.devices.find((d) => d.id === action.deviceId);
        recordEvent({
          homeId,
          waveId,
          source,
          automationId: current.id,
          automationName: current.name,
          deviceId: action.deviceId,
          deviceName: device?.name,
          outcome: "skipped",
          reason: "skip_continuous",
        });
      }
      continue;
    }
    const holding = holds.has(auto.id);
    cur = await runAutomation(homeId, cur, { ...current, actions }, {
      onlyIfDifferent: holding,
      source,
      waveId,
    });
  }
  return cur;
}

async function tickMatching(homeId: string, snap: HomeSnapshot) {
  const now = clockInTokyo();
  const nowMs = Date.now();
  const holds = new Set<string>();
  const keys = new Map<string, string>();
  const firing = collectMatchingAutomations(snap.automations, (auto) => {
    if (auto.trigger.type === "time") {
      const d = timeWouldRun(auto, now, nowMs);
      if (d.key) keys.set(auto.id, d.key);
      return d.run;
    }
    if (auto.trigger.type === "sensor") {
      const d = sensorWouldRun(auto, snap);
      if (d.key) keys.set(auto.id, d.key);
      if (d.run && d.holds) holds.add(auto.id);
      if (d.key?.endsWith(":fail") && auto.lastFiredKey?.endsWith(":pass")) {
        recordEvent({
          homeId,
          waveId: newWaveId(),
          source: "tick",
          automationId: auto.id,
          automationName: auto.name,
          outcome: "left",
        });
      }
      return d.run;
    }
    return false;
  });
  let cur = snap;
  if (keys.size) {
    cur = await saveHomeRecord(homeId, {
      automations: cur.automations.map((a) => {
        if (!keys.has(a.id)) return a;
        const key = keys.get(a.id);
        const fail = (key ?? "").endsWith(":fail");
        return {
          ...a,
          lastFiredKey: key,
          lastExecutedKey: fail ? undefined : a.lastExecutedKey,
        };
      }),
    });
  }
  return runPrioritized(homeId, cur, firing, holds, "tick");
}

async function refreshSensorReadings(homeId: string, snap: HomeSnapshot) {
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
      const merged = cur.devices
        .filter((d) => !isRetiredDaikinOutdoorId(d.id))
        .map((d) => {
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
  return cur;
}

export async function tickHome(homeId: string) {
  const rec = await loadHomeRecord(homeId);
  if (!rec) return;
  let snap = rec.snap;
  snap = await refreshSensorReadings(homeId, snap);
  recordHomeSamples(homeId, snap);
  await tickMatching(homeId, snap);
  pruneAnalysis(homeId);
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

export async function fireDeviceOnServer(
  homeId: string,
  deviceId: string,
  on?: boolean,
  source: AnalysisSource = "control",
) {
  if (on === undefined) return;
  const rec = await loadHomeRecord(homeId);
  if (!rec) return;
  const firing = collectMatchingAutomations(rec.snap.automations, (auto) => {
    if (auto.trigger.type !== "device") return false;
    if (auto.trigger.deviceId !== deviceId) return false;
    if (auto.trigger.deviceOn !== undefined && auto.trigger.deviceOn !== on) return false;
    return true;
  });
  await runPrioritized(homeId, rec.snap, firing, new Set(), source);
}

export async function fireSceneOnServer(
  homeId: string,
  sceneId: string,
  source: AnalysisSource = "scene",
) {
  const rec = await loadHomeRecord(homeId);
  if (!rec) return;
  const firing = collectMatchingAutomations(
    rec.snap.automations,
    (auto) => auto.trigger.type === "scene" && auto.trigger.sceneId === sceneId,
  );
  await runPrioritized(homeId, rec.snap, firing, new Set(), source);
}
