import { createHmac, randomUUID } from "node:crypto";
import type { Device } from "./types";

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
  const x = t.toLowerCase();
  if (x.includes("curtain") || x.includes("blind")) return "curtain";
  if (x.includes("lock")) return "lock";
  if (x.includes("plug") || x.includes("outlet")) return "plug";
  if (x.includes("bulb") || x.includes("light") || x.includes("lamp") || x.includes("ceiling")) return "light";
  if (x === "bot" || x.includes("bot")) return "bot";
  if (x.includes("meter") || x.includes("sensor") || x.includes("woiosensor") || x.includes("contact") || x.includes("motion"))
    return "sensor";
  if (x.includes("hub")) return "other";
  if (x.includes("air conditioner") || x.includes("エアコン")) return "ac";
  return "other";
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
      brightness: kind === "light" ? 80 : undefined,
      position: kind === "curtain" ? 50 : undefined,
      extra: d.deviceType,
    };
  });
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
  const irDevices: Device[] = ir.map((d) => ({
    id: `switchbot-ir:${d.deviceId}`,
    name: d.deviceName,
    room: roomFromName(d.deviceName),
    brand: "switchbot",
    kind: /エアコン|ac|air/i.test(d.deviceName)
      ? "ac"
      : /照明|ライト|light/i.test(d.deviceName)
        ? "light"
        : "ir",
    online: true,
    source: "live",
    nativeId: d.deviceId,
    connector: "switchbot",
    on: false,
    extra: `IR · ${d.deviceType || "リモコン"}`,
  }));
  return [...switchbotToDevices(physical), ...irDevices];
}

export async function switchbotControl(
  token: string,
  secret: string,
  device: Device,
  cmd: { on?: boolean; brightness?: number; position?: number },
) {
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
  await sb(token, secret, `/devices/${device.nativeId}/commands`, {
    method: "POST",
    body: JSON.stringify({ command, parameter, commandType: "command" }),
  });
}
