import { remoControl } from "@/lib/home/remo";
import { switchbotControl, switchbotUsesBle } from "@/lib/home/switchbot";
import { tuyaControl } from "@/lib/home/tuya";
import { odelicControl } from "@/lib/home/odelic";
import { daikinControl } from "@/lib/home/daikin";
import { matchesStep } from "@/lib/home/demo";
import { patchFromAction } from "@/lib/home/device-patch";
import { isMomentaryBot, type AutoAction, type Device } from "@/lib/home/types";
import type { HomeSnapshot } from "@/lib/home/snapshot";
import type { AnalysisSource } from "@/lib/home/analysis-series";
import { loadHomeRecord, saveHomeRecord } from "./home-db";
import { homeBelongsToLanOwner } from "./lan-owner";
import { newWaveId, patchDetail, recordEvent, recordOnSample, type DeviceLog } from "./analysis";

/** 宛先をサーバーの環境変数が持つコネクタ。利用者ごとの認証情報が無い。 */
const LAN_CONNECTORS = new Set<Device["connector"]>(["daikin", "odelec"]);

async function ownerOf(homeId: string): Promise<string> {
  return (await loadHomeRecord(homeId))?.ownerUserId ?? "";
}

function failReason(err: unknown) {
  const msg = err instanceof Error ? err.message : "操作に失敗しました";
  return msg.slice(0, 200);
}

export async function executeDevice(
  homeId: string,
  snap: HomeSnapshot,
  device: Device,
  patch: Partial<Device>,
  log?: DeviceLog,
) {
  const next = { ...device, ...patch };
  if (isMomentaryBot(next)) next.on = false;
  try {
    if (device.source === "live") {
      // LAN 直結は宛先をサーバーが持つ。持ち主以外の家に機器が残っていても、
      // 場面やオートメーション経由で他人の家へ指示が出ないようにする。
      if (
        (LAN_CONNECTORS.has(device.connector) || switchbotUsesBle(device)) &&
        !homeBelongsToLanOwner(await ownerOf(homeId))
      ) {
        throw new Error(`${device.name} はこの家からは操作できません`);
      }
      if (device.connector === "nature") {
        await remoControl(snap.credentials.natureToken, next, patch);
      } else if (device.connector === "switchbot") {
        await switchbotControl(snap.credentials.switchbotToken, snap.credentials.switchbotSecret, next, patch);
      } else if (device.connector === "smartlife") {
        await tuyaControl(
          snap.credentials.tuyaAccessId,
          snap.credentials.tuyaSecret,
          snap.credentials.tuyaRegion,
          next,
          patch,
        );
      } else if (device.connector === "daikin") {
        await daikinControl(next, patch);
      } else if (device.connector === "odelec") {
        await odelicControl(next, patch);
      } else {
        throw new Error("この機器は直接操作できません");
      }
    }
    const devices = snap.devices.map((d) => (d.id === device.id ? next : d));
    const saved = await saveHomeRecord(homeId, { devices });
    if (log) {
      recordEvent({
        homeId,
        waveId: log.waveId,
        source: log.source,
        automationId: log.automationId,
        automationName: log.automationName,
        deviceId: device.id,
        deviceName: device.name,
        outcome: "sent",
        detail: patchDetail(patch),
      });
      if (!isMomentaryBot(next) && next.on !== undefined && device.on !== next.on) {
        recordOnSample(homeId, device.id, next.on);
      }
    }
    return saved;
  } catch (err) {
    if (log) {
      recordEvent({
        homeId,
        waveId: log.waveId,
        source: log.source,
        automationId: log.automationId,
        automationName: log.automationName,
        deviceId: device.id,
        deviceName: device.name,
        outcome: "failed",
        reason: failReason(err),
        detail: patchDetail(patch),
      });
    }
    throw err;
  }
}

export async function executeScene(
  homeId: string,
  snap: HomeSnapshot,
  sceneId: string,
  source: AnalysisSource = "scene",
) {
  const scene = snap.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error("場面がありません");
  const log: DeviceLog = { source, waveId: newWaveId() };
  let cur = snap;
  for (const device of snap.devices) {
    let patch: Partial<Device> = {};
    let hit = false;
    for (const step of scene.steps) {
      if (matchesStep(device, step)) {
        patch = { ...patch, ...step.patch };
        hit = true;
      }
    }
    if (!hit) continue;
    try {
      cur = await executeDevice(homeId, cur, device, patch, log);
    } catch {
      /* continue */
    }
  }
  return saveHomeRecord(homeId, { lastScene: sceneId });
}

export async function executeAction(homeId: string, snap: HomeSnapshot, action: AutoAction, log?: DeviceLog) {
  if (!action.deviceId) return snap;
  const device = snap.devices.find((d) => d.id === action.deviceId);
  if (!device) return snap;
  try {
    return await executeDevice(homeId, snap, device, patchFromAction(action), log);
  } catch {
    return (await loadHomeRecord(homeId))?.snap ?? snap;
  }
}
