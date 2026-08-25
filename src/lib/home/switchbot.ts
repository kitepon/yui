import { createHmac, randomUUID } from "node:crypto";
import { switchbotKindFromType } from "./ha-catalog.ts";
import type { DevicePatch } from "./device-patch.ts";
import type { AcMode, Device, FanSpeed } from "./types";

const BASE = "https://api.switch-bot.com/v1.1";

function headers(token: string, secret: string) {
  const t = Date.now().toString();
  const nonce = randomUUID();
  const sign = createHmac("sha256", secret).update(token + t + nonce).digest("base64");
  return {
    Authorization: token,
    sign,
    t,
    nonce,
    "Content-Type": "application/json; charset=utf8",
  };
}

async function sb<T>(token: string, secret: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(token, secret), ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as { statusCode: number; message: string; body: T };
  if (!res.ok || json.statusCode !== 100) {
    throw new Error(`SwitchBot ${json.statusCode ?? res.status}: ${json.message || res.statusText}`);
  }
  return json.body;
}

interface SbDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  hubDeviceId?: string;
}

function roomFromName(name: string) {
  if (/寝室|ベッド|bed/i.test(name)) return "寝室";
  if (/玄関|廊下|entry|hall/i.test(name)) return "玄関";
  if (/リビング|居間|living|ldk/i.test(name)) return "リビング";
  return "その他";
}

function mapType(t: string): Device["kind"] {
  return switchbotKindFromType(t, false);
}

export function switchbotIrKind(deviceType: string, name: string): Device["kind"] {
  const fromType = switchbotKindFromType(deviceType, true);
  if (fromType !== "ir") return fromType;
  if (/エアコン|air\s*conditioner|\bac\b/i.test(name)) return "ac";
  if (/照明|ライト|\blight\b/i.test(name)) return "light";
  return "ir";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** SwitchBot の status を結の欄へ。取れない項目は触らない。 */
export function applySwitchbotStatus(device: Device, status: Record<string, unknown>): Device {
  const next = { ...device };
  const power = status.power;
  if (power === "on") next.on = true;
  if (power === "off") next.on = false;
  const temperature = asNumber(status.temperature);
  if (temperature != null) next.temperature = temperature;
  const humidity = asNumber(status.humidity);
  if (humidity != null) next.humidity = humidity;
  const brightness = asNumber(status.brightness);
  if (brightness != null && next.kind === "light") next.brightness = brightness;
  const slide = asNumber(status.slidePosition ?? status.position);
  if (slide != null && next.kind === "curtain") next.position = slide;
  const lock = status.lockState;
  if (typeof lock === "string") next.on = lock === "locked" || lock === "locking";
  return next;
}

const SB_AC_MODE: Record<AcMode, number> = {
  auto: 1,
  cool: 2,
  dry: 3,
  fan: 4,
  heat: 5,
  humidify: 3,
};

const SB_AC_FAN: Record<FanSpeed, number> = {
  auto: 1,
  quiet: 2,
  "1": 2,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 4,
};

/** HA と同じ SET_ALL: `温度,モード,風量,on/off`。 */
export function switchbotAcSetAll(device: Device, cmd: DevicePatch) {
  const temp = Math.round(cmd.targetTemp ?? device.targetTemp ?? 26);
  const mode = SB_AC_MODE[cmd.mode ?? device.mode ?? "cool"] ?? 2;
  const fan = SB_AC_FAN[cmd.fanSpeed ?? device.fanSpeed ?? "auto"] ?? 1;
  const power = cmd.on === false ? "off" : "on";
  return {
    command: "setAll",
    parameter: `${temp},${mode},${fan},${power}`,
    commandType: "command" as const,
  };
}

export function switchbotToDevices(list: SbDevice[]): Device[] {
  return list.map((d) => {
    const kind = mapType(d.deviceType);
    return {
      id: `switchbot:${d.deviceId}`,
      name: d.deviceName,
      room: roomFromName(d.deviceName),
      brand: "switchbot" as const,
      kind,
      online: true,
      source: "live" as const,
      nativeId: d.deviceId,
      connector: "switchbot" as const,
      on: kind === "lock" ? true : false,
      extra: d.deviceType,
    };
  });
}

async function fillSwitchbotStatus(token: string, secret: string, devices: Device[]) {
  const pending = devices.filter((d) => !d.id.startsWith("switchbot-ir:"));
  for (let i = 0; i < pending.length; i += 5) {
    const chunk = pending.slice(i, i + 5);
    await Promise.all(
      chunk.map(async (d) => {
        try {
          const status = await sb<Record<string, unknown>>(token, secret, `/devices/${d.nativeId}/status`);
          Object.assign(d, applySwitchbotStatus(d, status));
        } catch {
          /* 状態が取れない機種もある。一覧の kind はそのまま。 */
        }
      }),
    );
  }
}

export async function switchbotSync(token: string, secret: string) {
  const body = await sb<{
    deviceList?: SbDevice[];
    devices?: SbDevice[];
    infraredRemoteList?: SbDevice[];
  }>(token, secret, "/devices");
  const physical = body.deviceList ?? body.devices ?? [];
  const ir = (body.infraredRemoteList ?? []).map((d) => ({
    ...d,
    deviceType: d.deviceType || "IR",
  }));
  const irDevices: Device[] = ir.map((d) => {
    const kind = switchbotIrKind(d.deviceType || "IR", d.deviceName);
    return {
      id: `switchbot-ir:${d.deviceId}`,
      name: d.deviceName,
      room: roomFromName(d.deviceName),
      brand: "switchbot" as const,
      kind,
      online: true,
      source: "live" as const,
      nativeId: d.deviceId,
      connector: "switchbot" as const,
      on: false,
      targetTemp: kind === "ac" ? 26 : undefined,
      mode: kind === "ac" ? ("cool" as const) : undefined,
      fanSpeed: kind === "ac" ? ("auto" as const) : undefined,
      extra: `IR · ${d.deviceType || "リモコン"}`,
    };
  });
  const devices = [...switchbotToDevices(physical), ...irDevices];
  await fillSwitchbotStatus(token, secret, devices);
  return devices;
}

export async function switchbotControl(
  token: string,
  secret: string,
  device: Device,
  cmd: DevicePatch,
) {
  const body =
    device.kind === "ac"
      ? switchbotAcSetAll(device, cmd)
      : switchbotBasicCommand(device, cmd);
  await sb(token, secret, `/devices/${device.nativeId}/commands`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function switchbotBasicCommand(device: Device, cmd: DevicePatch) {
  let command = "turnOn";
  let parameter: string | number = "default";
  if (device.kind === "curtain") {
    if (cmd.position !== undefined) {
      command = "setPosition";
      parameter = `0,ff,${Math.round(cmd.position)}`;
    } else {
      command = cmd.on === false ? "close" : "open";
    }
  } else if (device.kind === "lock") {
    command = cmd.on === false ? "unlock" : "lock";
  } else if (cmd.on === false) {
    command = "turnOff";
  } else if (device.kind === "light" && cmd.brightness !== undefined) {
    command = "setBrightness";
    parameter = Math.round(cmd.brightness);
  }
  return { command, parameter, commandType: "command" as const };
}
