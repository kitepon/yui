import { AC_MODE_LABEL, type AcMode, type Climate, type Device } from "./types.ts";

const BASE = "https://api.nature.global/1";

async function remo<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nature Remo ${res.status}: ${text.slice(0, 180)}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return undefined as T;
  return (await res.json()) as T;
}

interface RemoDevice {
  id: string;
  name: string;
  newest_events?: {
    te?: { val: number };
    hu?: { val: number };
    il?: { val: number };
  };
}

interface RemoAppliance {
  id: string;
  nickname: string;
  type: string;
  device?: { name?: string };
  aircon?: { range?: { modes?: Record<string, { temp?: string[] }> } };
  settings?: {
    temp?: string;
    mode?: string;
    button?: string;
  };
  light?: { state?: { power?: string; brightness?: string } };
  signals?: Array<{ id: string; name: string }>;
}

function roomFromName(name: string) {
  if (/寝室|ベッド|bed/i.test(name)) return "寝室";
  if (/玄関|廊下|entry|hall/i.test(name)) return "玄関";
  if (/リビング|居間|living|ldk/i.test(name)) return "リビング";
  return "その他";
}

function mapMode(raw?: string): AcMode {
  switch (raw) {
    case "warm":
      return "heat";
    case "cool":
      return "cool";
    case "dry":
      return "dry";
    case "blow":
      return "fan";
    default:
      return "auto";
  }
}

function unmapMode(mode?: AcMode) {
  switch (mode) {
    case "heat":
      return "warm";
    case "fan":
      return "blow";
    case "cool":
    case "dry":
    case "auto":
      return mode;
    default:
      // 加湿など Nature Remo に無いモードは黙って別モードへ写さない
      return null;
  }
}

/** Nature の range.modes を機器の能力表へ写す。温度は数値の昇順、空文字は除く。 */
export function acModesFromRange(
  modes?: Record<string, { temp?: string[] }>,
): Device["acModes"] {
  if (!modes) return undefined;
  const out: Partial<Record<AcMode, string[]>> = {};
  for (const [raw, range] of Object.entries(modes)) {
    const mode = mapMode(raw);
    if (unmapMode(mode) !== raw) continue;
    out[mode] = (range.temp ?? [])
      .filter((t) => t !== "")
      .sort((a, b) => Number(a) - Number(b));
  }
  return Object.keys(out).length ? out : undefined;
}

/** 目標温度をそのモードの選べる値へ写す。相対値モード（負値を含む）は一致する値だけ、絶対値モードは最も近い値を選ぶ。null は温度を送らない。 */
export function pickAcTemp(list: string[] | undefined, target: number): string | null {
  if (!list?.length) return null;
  let best = list[0];
  for (const v of list) {
    if (Math.abs(Number(v) - target) < Math.abs(Number(best) - target)) best = v;
  }
  const relative = list.some((v) => Number(v) < 0);
  if (relative && Number(best) !== target) return null;
  return best;
}

export function climateFromRemo(devices: RemoDevice[]): Climate {
  const withTemp = devices.find((d) => d.newest_events?.te);
  const ev = withTemp?.newest_events;
  return {
    temperature: ev?.te?.val ?? null,
    humidity: ev?.hu?.val ?? null,
    lux: ev?.il?.val ?? null,
    label: withTemp ? `${withTemp.name} · Remo` : "Nature Remo",
  };
}

export function appliancesToDevices(list: RemoAppliance[]): Device[] {
  return list.map((a) => {
    const room = roomFromName(`${a.nickname} ${a.device?.name ?? ""}`);
    const base = {
      id: `nature:${a.id}`,
      name: a.nickname || a.type,
      room,
      online: true,
      source: "live" as const,
      nativeId: a.id,
      connector: "nature" as const,
      brand: "nature" as const,
      extra: a.device?.name ? `${a.device.name} · ${a.type}` : a.type,
    };
    if (a.type === "AC") {
      const off = a.settings?.button === "power-off";
      // 自動モードの相対値は "0" や負値がありうるので、|| で既定値へ丸めない。
      const temp = a.settings?.temp === "" || a.settings?.temp == null ? NaN : Number(a.settings.temp);
      return {
        ...base,
        kind: "ac" as const,
        on: !off,
        targetTemp: Number.isFinite(temp) ? temp : 26,
        mode: mapMode(a.settings?.mode),
        acModes: acModesFromRange(a.aircon?.range?.modes),
      };
    }
    if (a.type === "LIGHT") {
      const on = a.light?.state?.power === "on";
      const rawBright = Number(a.light?.state?.brightness);
      return {
        ...base,
        kind: "light" as const,
        on,
        brightness: Number.isFinite(rawBright) ? rawBright : on ? 80 : 0,
      };
    }
    return {
      ...base,
      kind: a.type === "IR" || a.type === "TV" ? ("ir" as const) : ("other" as const),
      on: false,
    };
  });
}

export function sensorsToDevices(devices: RemoDevice[]): Device[] {
  return devices.map((d) => ({
    id: `nature-sensor:${d.id}`,
    name: d.name || "Remo",
    room: roomFromName(d.name),
    brand: "nature" as const,
    kind: "sensor" as const,
    online: true,
    source: "live" as const,
    nativeId: d.id,
    connector: "nature" as const,
    temperature: d.newest_events?.te?.val,
    humidity: d.newest_events?.hu?.val,
    lux: d.newest_events?.il?.val,
  }));
}

export async function remoSync(token: string) {
  const [devices, appliances] = await Promise.all([
    remo<RemoDevice[]>(token, "/devices"),
    remo<RemoAppliance[]>(token, "/appliances"),
  ]);
  return {
    devices: [...sensorsToDevices(devices), ...appliancesToDevices(appliances)],
    climate: climateFromRemo(devices),
  };
}

export async function remoControl(
  token: string,
  device: Device,
  cmd: {
    on?: boolean;
    brightness?: number;
    targetTemp?: number;
    mode?: AcMode;
  },
) {
  if (device.kind === "ac") {
    const body = new URLSearchParams();
    if (cmd.on === false) body.set("button", "power-off");
    else {
      body.set("button", "");
      if (cmd.mode) {
        const raw = unmapMode(cmd.mode);
        if (!raw || (device.acModes && !device.acModes[cmd.mode])) {
          throw new Error(`${device.name} は「${AC_MODE_LABEL[cmd.mode]}」に対応していません`);
        }
        body.set("operation_mode", raw);
      }
      if (cmd.targetTemp != null) {
        const mode = device.mode;
        if (device.acModes && mode) {
          const temp = pickAcTemp(device.acModes[mode], cmd.targetTemp);
          if (temp != null) body.set("temperature", temp);
        } else {
          body.set("temperature", String(cmd.targetTemp));
        }
      }
    }
    await remo(token, `/appliances/${device.nativeId}/aircon_settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return;
  }
  if (device.kind === "light") {
    const body = new URLSearchParams();
    body.set("button", cmd.on === false ? "off" : "on");
    await remo(token, `/appliances/${device.nativeId}/light`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return;
  }
  if (device.kind === "ir") {
    await remoSendSignal(token, device, cmd.on);
    return;
  }
  throw new Error(`${device.name} は Nature Remo 経由では操作できません`);
}

/** オン・オフの信号名が無ければ、単独の信号をトグルとして送る。複数あって決められないなら選ばない。 */
export function pickRemoSignal(
  signals: Array<{ id: string; name: string }>,
  on?: boolean,
): { id: string; name: string } | null {
  if (!signals.length) return null;
  const wanted = on === false ? /オフ|off|消|切/i : /オン|on|つけ|点|入/i;
  return signals.find((s) => wanted.test(s.name)) ?? (signals.length === 1 ? signals[0] : null);
}

/** 赤外線機器は登録済みの信号を送る。 */
async function remoSendSignal(token: string, device: Device, on?: boolean) {
  const appliances = await remo<RemoAppliance[]>(token, "/appliances");
  const appliance = appliances.find((a) => a.id === device.nativeId);
  const signals = appliance?.signals ?? [];
  if (!signals.length) {
    throw new Error(`${device.name} に登録された赤外線信号がありません`);
  }
  const hit = pickRemoSignal(signals, on);
  if (!hit) {
    throw new Error(
      `${device.name} のどの信号を送るか決められません（${signals.map((s) => s.name).join("・")}）`,
    );
  }
  await remo(token, `/signals/${hit.id}/send`, { method: "POST" });
}
