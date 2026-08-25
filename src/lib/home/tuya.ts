import { createHash, createHmac, randomUUID } from "node:crypto";
import { tuyaKindFromCategory } from "./ha-catalog.ts";
import type { DevicePatch } from "./device-patch.ts";
import type { AcMode, Device, FanSpeed } from "./types";

export const TUYA_REGIONS = [
  { id: "us", label: "Western America (tuyaus)", host: "https://openapi.tuyaus.com" },
  { id: "eu", label: "Central Europe (tuyaeu)", host: "https://openapi.tuyaeu.com" },
  { id: "jp", label: "Japan (tuyajp)", host: "https://openapi.tuyajp.com" },
  { id: "we", label: "Western Europe", host: "https://openapi-weaz.tuyaeu.com" },
  { id: "in", label: "India (tuyain)", host: "https://openapi.tuyain.com" },
  { id: "cn", label: "China (tuyacn)", host: "https://openapi.tuyacn.com" },
] as const;

export type TuyaRegionId = (typeof TUYA_REGIONS)[number]["id"];

type TuyaEnvelope<T> = {
  success: boolean;
  code?: number;
  msg?: string;
  result: T;
};

function explainTuya(code?: number, msg?: string) {
  const text = (msg || "").trim();
  if (code === 1004 || /sign/i.test(text)) {
    return "署名エラーです。Access Secret が違うか、データセンターが合っていません。";
  }
  if (code === 1010 || /token/i.test(text)) {
    return "トークンの取得に失敗しました。Access ID / Secret を確認してください。";
  }
  if (code === 1106 || /permission/i.test(text)) {
    return "権限がありません。プロジェクトで Smart Life アカウントを QR 連携し、そのユーザーの UID を使ってください。";
  }
  if (code === 2008 || /not exist/i.test(text) || /user/i.test(text)) {
    return "UID が見つかりません。連携した Smart Life ユーザーの UID をコピーしてください。";
  }
  if (/data center|datacenter|region/i.test(text)) {
    return "データセンターが違います。接続タブでリージョンを切り替えてください。";
  }
  return text ? `Tuya: ${text}${code != null ? ` (${code})` : ""}` : "Tuya の同期に失敗しました";
}

function sign(
  secret: string,
  clientId: string,
  t: string,
  nonce: string,
  method: string,
  path: string,
  accessToken = "",
  body = "",
) {
  const contentHash = createHash("sha256").update(body).digest("hex");
  const stringToSign = [method, contentHash, "", path].join("\n");
  const source = clientId + accessToken + t + nonce + stringToSign;
  return createHmac("sha256", secret).update(source).digest("hex").toUpperCase();
}

async function tuyaGet<T>(
  host: string,
  accessId: string,
  secret: string,
  path: string,
  accessToken = "",
): Promise<T> {
  const t = Date.now().toString();
  const nonce = randomUUID();
  const sig = sign(secret, accessId, t, nonce, "GET", path, accessToken);
  const res = await fetch(`${host}${path}`, {
    headers: {
      client_id: accessId,
      sign: sig,
      t,
      nonce,
      sign_method: "HMAC-SHA256",
      ...(accessToken ? { access_token: accessToken } : {}),
    },
  });
  let json: TuyaEnvelope<T>;
  try {
    json = (await res.json()) as TuyaEnvelope<T>;
  } catch {
    throw new Error(`Tuya: HTTP ${res.status}`);
  }
  if (!json.success) {
    throw new Error(explainTuya(json.code, json.msg));
  }
  return json.result;
}

async function tuyaPost<T>(
  host: string,
  accessId: string,
  secret: string,
  path: string,
  accessToken: string,
  payload: unknown,
): Promise<T> {
  const t = Date.now().toString();
  const nonce = randomUUID();
  const body = JSON.stringify(payload);
  const sig = sign(secret, accessId, t, nonce, "POST", path, accessToken, body);
  const res = await fetch(`${host}${path}`, {
    method: "POST",
    headers: {
      client_id: accessId,
      sign: sig,
      t,
      nonce,
      sign_method: "HMAC-SHA256",
      access_token: accessToken,
      "Content-Type": "application/json",
    },
    body,
  });
  let json: TuyaEnvelope<T>;
  try {
    json = (await res.json()) as TuyaEnvelope<T>;
  } catch {
    throw new Error(`Tuya: HTTP ${res.status}`);
  }
  if (!json.success) {
    throw new Error(explainTuya(json.code, json.msg));
  }
  return json.result;
}

async function getToken(host: string, accessId: string, secret: string) {
  return tuyaGet<{ access_token: string }>(host, accessId, secret, "/v1.0/token?grant_type=1");
}

type RawDevice = {
  id?: string;
  devId?: string;
  device_id?: string;
  deviceId?: string;
  name?: string;
  online?: boolean;
  category?: string;
  product_name?: string;
  status?: Array<{ code: string; value: unknown }>;
};

function asDeviceList(result: unknown): RawDevice[] {
  if (Array.isArray(result)) return result as RawDevice[];
  if (!result || typeof result !== "object") return [];
  const obj = result as Record<string, unknown>;
  for (const key of ["devices", "list", "device_list", "data"]) {
    if (Array.isArray(obj[key])) return obj[key] as RawDevice[];
  }
  return [];
}

function asHomes(result: unknown): Array<{ home_id?: number; homeId?: number; name?: string }> {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as { homes?: unknown; list?: unknown };
    if (Array.isArray(obj.homes)) return obj.homes;
    if (Array.isArray(obj.list)) return obj.list;
  }
  return [];
}

function asRooms(result: unknown): Array<{ room_id?: number; roomId?: number; name?: string }> {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as { rooms?: unknown; list?: unknown };
    if (Array.isArray(obj.rooms)) return obj.rooms;
    if (Array.isArray(obj.list)) return obj.list;
  }
  return [];
}

type TuyaStatus = { code: string; value: unknown };

/** 水温・温度計。Tuya の標準 category。swtz は水温計、szjcy は水質（水温を含む）、wsdcg は温湿度。 */
const TEMP_SENSOR_CATS = new Set(["swtz", "szjcy", "wsdcg", "sz"]);
const WATER_TEMP_CATS = new Set(["swtz", "szjcy"]);
const TEMP_CODES = [
  "water_temp",
  "temp_current",
  "va_temperature",
  "temp_current_external",
  "temp_value",
  "sensor_temperature",
];
const HUMIDITY_CODES = ["humidity_value", "humidity_current", "va_humidity", "humidity"];
const LUX_CODES = ["illuminance", "bright_value"];
const BRIGHT_CODES = ["bright_value_v2", "bright_value", "bright_value_1"];
const POSITION_CODES = ["percent_control", "percent_control_2", "percent_state"];
const TEMP_SET_CODES = ["temp_set", "temp_set_f"];
const MODE_CODES = ["mode", "work_mode"];
const FAN_CODES = ["fan_speed_enum", "fan_speed", "windspeed"];

function kindFromCategory(cat: string): Device["kind"] {
  const mapped = tuyaKindFromCategory(cat);
  if (mapped !== "other") return mapped;
  if (TEMP_SENSOR_CATS.has(cat.toLowerCase())) return "sensor";
  return "other";
}

const AC_MODE_VOCAB: Array<[AcMode, string[]]> = [
  ["cool", ["cold", "cool"]],
  ["heat", ["hot", "heat", "warm"]],
  ["dry", ["wet", "dry", "dehumidify"]],
  ["fan", ["wind", "fan", "blow"]],
  ["auto", ["auto"]],
];

function tuyaModeToAc(value: unknown): AcMode | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  for (const [mode, tokens] of AC_MODE_VOCAB) {
    if (tokens.includes(lower)) return mode;
  }
  return undefined;
}

function acModeToTuya(mode: AcMode, current: unknown): string {
  const tokens = AC_MODE_VOCAB.find(([m]) => m === mode)?.[1] ?? ["auto"];
  if (typeof current === "string") {
    for (const row of [
      ["cold", "hot", "wet", "wind", "auto"],
      ["cool", "heat", "dry", "fan", "auto"],
      ["COOL", "HEAT", "DRY", "FAN", "AUTO"],
    ]) {
      if (row.some((x) => x.toLowerCase() === current.toLowerCase())) {
        const idx = { cool: 0, heat: 1, dry: 2, fan: 3, auto: 4, humidify: 2 }[mode];
        return row[idx] ?? tokens[0];
      }
    }
  }
  return tokens[0];
}

function tuyaFanToSpeed(value: unknown): FanSpeed | undefined {
  if (typeof value === "number") {
    if (value <= 1) return "1";
    if (value === 2) return "2";
    if (value >= 3) return "3";
  }
  if (typeof value !== "string") return undefined;
  const v = value.toLowerCase();
  if (v === "auto") return "auto";
  if (v === "low" || v === "min" || v === "quiet") return "1";
  if (v === "middle" || v === "mid" || v === "medium") return "3";
  if (v === "high" || v === "max") return "5";
  if (v === "1" || v === "2" || v === "3" || v === "4" || v === "5") return v;
  return undefined;
}

function fanSpeedToTuya(speed: FanSpeed, current: unknown): unknown {
  if (typeof current === "number") {
    if (speed === "auto" || speed === "quiet" || speed === "1") return 1;
    if (speed === "2") return 2;
    return 3;
  }
  const v = String(current ?? "auto").toLowerCase();
  const mapped =
    speed === "auto" ? "auto" : speed === "quiet" || speed === "1" || speed === "2" ? "low" : speed === "3" ? "middle" : "high";
  if (v === "mid" && mapped === "middle") return "mid";
  if (typeof current === "string" && current === current.toUpperCase()) return mapped.toUpperCase();
  return mapped;
}

function invertCurtainPercent(category: string, percent: number) {
  // HA の CL / CLKG は inverted percentage（機器 0 = 開）
  if (category === "cl" || category === "clkg") return 100 - percent;
  return percent;
}

function brightnessToDevice(percent: number, current: unknown) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const n = asNumber(current);
  if (n != null && n > 100) return Math.max(10, Math.min(1000, p * 10));
  if (n != null) return p;
  return Math.max(10, p * 10);
}

function brightnessFromDevice(value: number) {
  if (value > 100) return Math.max(0, Math.min(100, Math.round(value / 10)));
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isWaterName(name: string) {
  return /水温|水槽|アクアリウム|aquarium|pool\s*temp|water\s*temp/i.test(name);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Tuya の温度・湿度は整数の十分の一（scale 1）が多い。100 未満はそのまま。 */
function scaleTenths(value: number) {
  if (Number.isInteger(value) && Math.abs(value) >= 100) return value / 10;
  return value;
}

function statusByCode(status: TuyaStatus[] | undefined) {
  const map = new Map<string, unknown>();
  for (const s of status ?? []) map.set(s.code, s.value);
  return map;
}

function firstReading(map: Map<string, unknown>, codes: string[]) {
  for (const code of codes) {
    const n = asNumber(map.get(code));
    if (n != null) return { code, value: n };
  }
  return undefined;
}

export function readingsFromTuyaStatus(status: TuyaStatus[] | undefined) {
  const map = statusByCode(status);
  const temp = firstReading(map, TEMP_CODES);
  const humidity = firstReading(map, HUMIDITY_CODES);
  const lux = firstReading(map, LUX_CODES);
  return {
    temperature: temp ? scaleTenths(temp.value) : undefined,
    humidity: humidity ? scaleTenths(humidity.value) : undefined,
    lux: lux?.value,
    water: Boolean(map.has("water_temp") || temp?.code === "water_temp"),
  };
}

function guessRoom(name: string, hinted?: string) {
  if (hinted?.trim()) return hinted.trim();
  if (/寝室|ベッド/.test(name)) return "寝室";
  if (/玄関/.test(name)) return "玄関";
  if (/リビング|居間/.test(name)) return "リビング";
  return "その他";
}

export function mapTuyaDevices(raw: RawDevice[], roomHint?: string): Device[] {
  const devices: Device[] = [];
  for (const d of raw) {
    const nativeId = String(d.id || d.devId || d.device_id || d.deviceId || "");
    if (!nativeId) continue;
    const name = d.name || d.product_name || nativeId;
    const cat = (d.category || "").toLowerCase();
    const reading = readingsFromTuyaStatus(d.status);
    const water = WATER_TEMP_CATS.has(cat) || isWaterName(name) || reading.water;
    let kind = kindFromCategory(cat);
    if (kind === "other" && (reading.temperature != null || water)) kind = "sensor";
    const status = d.status ?? [];
    const switchStatus =
      pickSwitchStatus(status, kind) ??
      status.find((s) => s.code === "switch_1" || s.code === "switch" || s.code === "switch_led");
    const bright = firstReading(statusByCode(status), BRIGHT_CODES);
    const pos = firstReading(statusByCode(status), POSITION_CODES);
    const tempSet = firstReading(statusByCode(status), TEMP_SET_CODES);
    const modeRaw = status.find((s) => MODE_CODES.includes(s.code));
    const fanRaw = status.find((s) => FAN_CODES.includes(s.code));
    devices.push({
      id: `smartlife:${nativeId}`,
      name,
      room: guessRoom(name, roomHint),
      extra: water ? "水温" : d.category || d.product_name,
      brand: "smartlife",
      kind,
      online: Boolean(d.online),
      source: "live",
      nativeId,
      connector: "smartlife",
      on: typeof switchStatus?.value === "boolean" ? switchStatus.value : false,
      brightness: kind === "light" && bright ? brightnessFromDevice(bright.value) : undefined,
      position: kind === "curtain" && pos ? invertCurtainPercent(cat, pos.value) : undefined,
      targetTemp: kind === "ac" && tempSet ? scaleTenths(tempSet.value) : undefined,
      mode: kind === "ac" ? tuyaModeToAc(modeRaw?.value) : undefined,
      fanSpeed: kind === "ac" ? tuyaFanToSpeed(fanRaw?.value) : undefined,
      temperature: reading.temperature,
      humidity: reading.humidity,
      lux: kind === "sensor" ? reading.lux : firstReading(statusByCode(status), ["illuminance"])?.value,
    });
  }
  return devices;
}

function mergeDevices(into: Map<string, Device>, list: Device[]) {
  for (const d of list) {
    const prev = into.get(d.nativeId);
    if (!prev) {
      into.set(d.nativeId, d);
      continue;
    }
    into.set(d.nativeId, {
      ...prev,
      ...d,
      room: prev.room !== "その他" ? prev.room : d.room,
      kind: prev.kind !== "other" ? prev.kind : d.kind,
      extra: d.extra === "水温" || prev.extra === "水温" ? "水温" : d.extra || prev.extra,
      temperature: d.temperature ?? prev.temperature,
      humidity: d.humidity ?? prev.humidity,
      lux: d.lux ?? prev.lux,
      brightness: d.brightness ?? prev.brightness,
      position: d.position ?? prev.position,
      targetTemp: d.targetTemp ?? prev.targetTemp,
      mode: d.mode ?? prev.mode,
      fanSpeed: d.fanSpeed ?? prev.fanSpeed,
    });
  }
}

function asStatusList(result: unknown): TuyaStatus[] {
  if (Array.isArray(result)) return result as TuyaStatus[];
  if (result && typeof result === "object") {
    const obj = result as { status?: unknown; result?: unknown };
    if (Array.isArray(obj.status)) return obj.status as TuyaStatus[];
    if (Array.isArray(obj.result)) return obj.result as TuyaStatus[];
  }
  return [];
}

function pickSwitchStatus(status: TuyaStatus[], kind: Device["kind"]) {
  const bools = status.filter((s) => typeof s.value === "boolean");
  const preferred =
    kind === "light"
      ? ["switch_led", "switch_led_1", "light", "switch_1", "switch"]
      : kind === "ac"
        ? ["switch", "switch_1"]
        : ["switch_1", "switch", "switch_led"];
  for (const code of preferred) {
    const hit = bools.find((s) => s.code === code);
    if (hit) return hit;
  }
  return bools.find((s) => s.code.startsWith("switch") || s.code === "light");
}

function pickStatus(status: TuyaStatus[], codes: string[]) {
  for (const code of codes) {
    const hit = status.find((s) => s.code === code);
    if (hit) return hit;
  }
  return undefined;
}

/** 機器が持つ DP だけを見て、結の操作を Tuya commands へ写す。 */
export function tuyaCommandsFromPatch(
  status: TuyaStatus[],
  device: Device,
  cmd: DevicePatch,
): Array<{ code: string; value: unknown }> {
  const commands: Array<{ code: string; value: unknown }> = [];
  const category = (device.extra ?? "").toLowerCase();

  if (cmd.on !== undefined) {
    const sw = pickSwitchStatus(status, device.kind);
    if (sw) commands.push({ code: sw.code, value: cmd.on });
  }

  if (cmd.brightness != null) {
    const bright = pickStatus(status, BRIGHT_CODES);
    if (bright) commands.push({ code: bright.code, value: brightnessToDevice(cmd.brightness, bright.value) });
  }

  if (cmd.position != null) {
    const pos = pickStatus(status, ["percent_control", "percent_control_2"]) ?? pickStatus(status, POSITION_CODES);
    if (pos) {
      const sent = invertCurtainPercent(category, cmd.position);
      commands.push({ code: pos.code === "percent_state" ? "percent_control" : pos.code, value: sent });
    }
  }

  if (cmd.targetTemp != null) {
    const temp = pickStatus(status, TEMP_SET_CODES);
    if (temp) {
      const current = asNumber(temp.value);
      const value =
        current != null && Number.isInteger(current) && Math.abs(current) >= 100
          ? Math.round(cmd.targetTemp * 10)
          : cmd.targetTemp;
      commands.push({ code: temp.code, value });
    }
  }

  if (cmd.mode) {
    const mode = pickStatus(status, MODE_CODES);
    if (mode) commands.push({ code: mode.code, value: acModeToTuya(cmd.mode, mode.value) });
  }

  if (cmd.fanSpeed) {
    const fan = pickStatus(status, FAN_CODES);
    if (fan) commands.push({ code: fan.code, value: fanSpeedToTuya(cmd.fanSpeed, fan.value) });
  }

  return commands;
}

function applyReadings(device: Device, status: TuyaStatus[]) {
  const reading = readingsFromTuyaStatus(status);
  if (reading.temperature != null) device.temperature = reading.temperature;
  if (reading.humidity != null) device.humidity = reading.humidity;
  if (reading.lux != null) device.lux = reading.lux;
  if (reading.water) device.extra = "水温";
  if (device.kind === "other" && reading.temperature != null) device.kind = "sensor";
}

async function tryGet(host: string, accessId: string, secret: string, path: string, token: string) {
  try {
    return await tuyaGet<unknown>(host, accessId, secret, path, token);
  } catch {
    return null;
  }
}

async function listForUid(
  host: string,
  accessId: string,
  secret: string,
  token: string,
  uid: string,
) {
  const encoded = encodeURIComponent(uid);
  const bag = new Map<string, Device>();

  const paths = [
    `/v1.0/users/${encoded}/devices`,
    `/v1.0/iot-01/associated-users/actions/devices?uid=${encoded}`,
    "/v1.0/iot-03/devices?page_no=1&page_size=100",
    "/v1.3/iot-03/devices?page_size=100",
    "/v2.0/cloud/thing/device?page_size=100",
  ];
  for (const path of paths) {
    const result = await tryGet(host, accessId, secret, path, token);
    if (result) mergeDevices(bag, mapTuyaDevices(asDeviceList(result)));
  }

  let lastKey = "";
  for (let page = 0; page < 8; page++) {
    const q = lastKey
      ? `/v1.3/iot-03/devices?page_size=100&last_row_key=${encodeURIComponent(lastKey)}`
      : "/v1.3/iot-03/devices?page_size=100";
    const result = await tryGet(host, accessId, secret, q, token);
    if (!result) break;
    mergeDevices(bag, mapTuyaDevices(asDeviceList(result)));
    const rec = result as { last_row_key?: string; has_more?: boolean };
    if (!rec.has_more || !rec.last_row_key || rec.last_row_key === lastKey) break;
    lastKey = rec.last_row_key;
  }

  const homesRaw = await tryGet(host, accessId, secret, `/v1.0/users/${encoded}/homes`, token);
  const homes = asHomes(homesRaw);
  for (const home of homes) {
    const homeId = home.home_id ?? home.homeId;
    if (homeId == null) continue;
    const homeDevices = await tryGet(host, accessId, secret, `/v1.0/homes/${homeId}/devices`, token);
    if (homeDevices) mergeDevices(bag, mapTuyaDevices(asDeviceList(homeDevices)));

    const roomsRaw = await tryGet(host, accessId, secret, `/v1.0/homes/${homeId}/rooms`, token);
    for (const room of asRooms(roomsRaw)) {
      const roomId = room.room_id ?? room.roomId;
      if (roomId == null) continue;
      const roomDevices = await tryGet(
        host,
        accessId,
        secret,
        `/v1.0/homes/${homeId}/rooms/${roomId}/devices`,
        token,
      );
      if (roomDevices) mergeDevices(bag, mapTuyaDevices(asDeviceList(roomDevices), room.name));
    }
  }

  const devices = [...bag.values()];
  await fillMissingReadings(host, accessId, secret, token, devices);
  return devices;
}

async function fillMissingReadings(
  host: string,
  accessId: string,
  secret: string,
  token: string,
  devices: Device[],
) {
  const pending = devices.filter(
    (d) =>
      d.kind === "sensor" &&
      d.temperature == null &&
      d.humidity == null &&
      d.lux == null,
  );
  await Promise.all(
    pending.map(async (d) => {
      const raw = await tryGet(
        host,
        accessId,
        secret,
        `/v1.0/iot-03/devices/${d.nativeId}/status`,
        token,
      );
      const status = asStatusList(raw);
      if (status.length) applyReadings(d, status);
    }),
  );
}

export async function tuyaSync(
  accessId: string,
  secret: string,
  uid: string,
  region: string = "auto",
): Promise<{ devices: Device[]; region: string; regionLabel: string; rooms: string[] }> {
  const preferred = TUYA_REGIONS.filter((r) => region === "auto" || r.id === region);
  const rest = TUYA_REGIONS.filter((r) => !preferred.includes(r));
  const order = region === "auto" ? TUYA_REGIONS : [...preferred, ...rest];

  let lastError: Error = new Error("Tuya の同期に失敗しました");
  for (const dc of order) {
    try {
      const token = await getToken(dc.host, accessId, secret);
      const devices = await listForUid(dc.host, accessId, secret, token.access_token, uid);
      if (!devices.length) {
        throw new Error(
          `接続はできましたが機器が0台です（${dc.label}）。プロジェクトの Devices → Link Tuya App Account で Smart Life を連携し、UID がそのユーザーか確認してください。`,
        );
      }
      return {
        devices,
        region: dc.id,
        regionLabel: dc.label,
        rooms: [...new Set(devices.map((d) => d.room))],
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError;
}

/** Smart Life（Tuya）の操作。機器が実際に持つ DP だけを送る。 */
export async function tuyaControl(
  accessId: string,
  secret: string,
  region: string,
  device: Device,
  cmd: DevicePatch,
) {
  const dc = TUYA_REGIONS.find((r) => r.id === region);
  if (!dc) {
    throw new Error("Smart Life のデータセンターが未確定です。接続タブで一度同期してください。");
  }
  const token = await getToken(dc.host, accessId, secret);
  const status = asStatusList(
    await tuyaGet<unknown>(
      dc.host,
      accessId,
      secret,
      `/v1.0/iot-03/devices/${device.nativeId}/status`,
      token.access_token,
    ),
  );
  const commands = tuyaCommandsFromPatch(status, device, cmd);
  if (!commands.length) {
    throw new Error(`${device.name} に送れる操作がありません`);
  }
  await tuyaPost(
    dc.host,
    accessId,
    secret,
    `/v1.0/iot-03/devices/${device.nativeId}/commands`,
    token.access_token,
    { commands },
  );
}
