import { remoControl } from "@/lib/home/remo";
import { switchbotControl } from "@/lib/home/switchbot";
import { tuyaControl } from "@/lib/home/tuya";
import { odelicControl } from "@/lib/home/odelic";
import { daikinControl } from "@/lib/home/daikin";
import { matchesStep } from "@/lib/home/demo";
import type { AutoAction, Device } from "@/lib/home/types";
import type { HomeSnapshot } from "@/lib/home/snapshot";
import { loadHomeRecord, saveHomeRecord } from "./home-db";

export async function executeDevice(
  homeId: string,
  snap: HomeSnapshot,
  device: Device,
  patch: Partial<Device>,
) {
  const next = { ...device, ...patch };
  if (device.source === "live") {
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
  return saveHomeRecord(homeId, { devices });
}

export async function executeScene(homeId: string, snap: HomeSnapshot, sceneId: string) {
  const scene = snap.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error("場面がありません");
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
      cur = await executeDevice(homeId, cur, device, patch);
    } catch {
      /* continue */
    }
  }
  return saveHomeRecord(homeId, { lastScene: sceneId });
}

export async function executeAction(homeId: string, snap: HomeSnapshot, action: AutoAction) {
  if (!action.deviceId) return snap;
  const device = snap.devices.find((d) => d.id === action.deviceId);
  if (!device) return snap;
  try {
    return await executeDevice(homeId, snap, device, {
      on: action.on,
      brightness: action.brightness,
      targetTemp: action.targetTemp,
      mode: action.mode,
      position: action.position,
    });
  } catch {
    return (await loadHomeRecord(homeId))?.snap ?? snap;
  }
}
