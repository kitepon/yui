import type { AcMode, Device, DeviceCommand } from "./types.ts";
import { AC_MODE_LABEL, FAN_SPEED_LABEL, FAN_SWING_LABEL } from "./types.ts";

/** DeviceCommand から機器 id を除いた、機器へ送る操作。 */
export type DevicePatch = Omit<DeviceCommand, "id">;

const MODE_ORDER: AcMode[] = ["cool", "heat", "dry", "humidify", "fan", "auto"];
const FAN_SPEED_MODES: AcMode[] = ["auto", "cool", "heat", "fan"];
const FAN_SWING_MODES: AcMode[] = ["auto", "cool", "heat", "fan", "dry"];

/** 能力表があればそのモードだけ、無ければ従来の5モード（デモ機器など。加湿は対応機だけ）。 */
export function acModesOf(device: Device): AcMode[] {
  if (!device.acModes) return MODE_ORDER.filter((m) => m !== "humidify");
  return MODE_ORDER.filter((m) => device.acModes?.[m]);
}

/** いま操作対象のモードで選べる温度リスト。能力表が無ければ従来の 16〜32。 */
export function acTempsOf(device: Device): string[] {
  const mode = device.mode ?? "auto";
  if (!device.acModes) return Array.from({ length: 17 }, (_, i) => String(16 + i));
  return device.acModes[mode] ?? [];
}

/**
 * 風量を出せる運転か。ダイキン直結はモード別プロパティを持つので、
 * いまの読み取り値が空でも（除湿から切替直後など）出す。他社は値が載った機器だけ。
 */
export function canSetFanSpeed(device: Device): boolean {
  const mode = device.mode;
  if (mode && !FAN_SPEED_MODES.includes(mode)) return false;
  if (device.connector === "daikin") return mode != null;
  return device.fanSpeed != null;
}

/** 風向スイング。加湿にはプロパティが無い。 */
export function canSetFanSwing(device: Device): boolean {
  const mode = device.mode;
  if (mode && !FAN_SWING_MODES.includes(mode)) return false;
  if (device.connector === "daikin") return mode != null;
  return device.fanSwing != null;
}

/** 除湿・加湿の目標湿度。対応機で、その運転のときだけ。 */
export function canSetTargetHumidity(device: Device): boolean {
  if (device.mode !== "dry" && device.mode !== "humidify") return false;
  if (device.targetHumidity != null) return true;
  if (device.connector === "daikin") return true;
  return Boolean(device.mode === "humidify" && device.acModes?.humidify);
}

export function patchFromAction(action: DevicePatch): DevicePatch {
  const patch: DevicePatch = {};
  if (action.on !== undefined) patch.on = action.on;
  if (action.brightness != null) patch.brightness = action.brightness;
  if (action.targetTemp != null) patch.targetTemp = action.targetTemp;
  if (action.targetHumidity != null) patch.targetHumidity = action.targetHumidity;
  if (action.fanSpeed) patch.fanSpeed = action.fanSpeed;
  if (action.fanSwing) patch.fanSwing = action.fanSwing;
  if (action.mode) patch.mode = action.mode;
  if (action.position != null) patch.position = action.position;
  return patch;
}

/**
 * いまの設定を機器から読み返せるか。
 * SwitchBot IR は `targetTemp: 26` を仮置きしているだけなので、値があることでは判定しない。
 */
export function reportsActuatorState(device: Device): boolean {
  if (device.kind === "sensor" || device.kind === "ir" || device.kind === "other") return false;
  if (device.id.startsWith("switchbot-ir:")) return false;
  if (device.connector === "odelec") return false;
  if (device.source === "demo") return true;
  if (device.connector === "daikin" || device.connector === "smartlife") return true;
  if (device.connector === "switchbot") return true;
  if (device.connector === "nature") {
    return device.kind === "ac" || device.kind === "light" || device.kind === "plug";
  }
  return false;
}

/** patch に載った項目が、いまの機器状態と同じなら true（送る必要なし）。 */
export function patchAlreadyApplied(device: Device, patch: DevicePatch): boolean {
  const p = patchFromAction(patch);
  if (Object.keys(p).length === 0) return true;
  if (p.on !== undefined && device.on !== p.on) return false;
  if (p.brightness != null && device.brightness !== p.brightness) return false;
  if (p.targetTemp != null && device.targetTemp !== p.targetTemp) return false;
  if (p.targetHumidity != null && device.targetHumidity !== p.targetHumidity) return false;
  if (p.fanSpeed && device.fanSpeed !== p.fanSpeed) return false;
  if (p.fanSwing && device.fanSwing !== p.fanSwing) return false;
  if (p.mode && device.mode !== p.mode) return false;
  if (p.position != null && device.position !== p.position) return false;
  return true;
}

/** 操作を足したあと、その運転では送れない項目を落とす。 */
export function applyDevicePatch<T extends DevicePatch>(action: T, device: Device, patch: DevicePatch): T {
  const next = { ...action, ...patch };
  const preview: Device = { ...device, ...patchFromAction(next) };
  if (preview.kind !== "light") delete next.brightness;
  if (preview.kind !== "curtain") delete next.position;
  if (preview.kind !== "ac") {
    delete next.targetTemp;
    delete next.targetHumidity;
    delete next.fanSpeed;
    delete next.fanSwing;
    delete next.mode;
  } else {
    if (!acTempsOf(preview).length) delete next.targetTemp;
    if (!canSetTargetHumidity(preview)) delete next.targetHumidity;
    if (!canSetFanSpeed(preview)) delete next.fanSpeed;
    if (!canSetFanSwing(preview)) delete next.fanSwing;
  }
  return next;
}

export function describePatch(patch: DevicePatch): string[] {
  const bits: string[] = [];
  if (patch.on === true) bits.push("入");
  if (patch.on === false) bits.push("切");
  if (patch.brightness != null) bits.push(`${patch.brightness}%`);
  if (patch.mode) bits.push(AC_MODE_LABEL[patch.mode]);
  if (patch.targetTemp != null) bits.push(`${patch.targetTemp}°`);
  if (patch.targetHumidity != null) bits.push(patch.targetHumidity === 0 ? "連続" : `${patch.targetHumidity}%`);
  if (patch.fanSpeed) bits.push(`風量${FAN_SPEED_LABEL[patch.fanSpeed]}`);
  if (patch.fanSwing) bits.push(`風向${FAN_SWING_LABEL[patch.fanSwing]}`);
  if (patch.position != null) bits.push(`開${patch.position}`);
  return bits;
}
