import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Device, DeviceKind } from "./types";

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

function kindFromCategory(cat: string): DeviceKind {
  const c = cat.toLowerCase();
  if (c.includes("dj") || c.includes("dd") || c.includes("light") || c.includes("lamp")) return "light";
  if (c.includes("kg") || c.includes("cz") || c.includes("pc") || c.includes("plug") || c.includes("socket")) return "plug";
  if (c.includes("cl") || c.includes("curtain")) return "curtain";
  if (c.includes("kt") || c.includes("ac") || c.includes("air")) return "ac";
  return "other";
}

function guessRoom(name: string, hinted?: string) {
  if (hinted?.trim()) return hinted.trim();
  if (/寝室|ベッド/.test(name)) return "寝室";
  if (/玄関/.test(name)) return "玄関";
  if (/リビング|居間/.test(name)) return "リビング";
  return "その他";
}

function mapDevices(raw: RawDevice[], roomHint?: string): Device[] {
  const devices: Device[] = [];
  for (const d of raw) {
    const nativeId = String(d.id || d.devId || d.device_id || d.deviceId || "");
    if (!nativeId) continue;
    const name = d.name || d.product_name || nativeId;
    const switchStatus = d.status?.find(
      (s) => s.code === "switch_1" || s.code === "switch" || s.code === "switch_led",
    );
    devices.push({
      id: `smartlife:${nativeId}`,
      name,
      room: guessRoom(name, roomHint),
      extra: d.category || d.product_name,
      brand: "smartlife",
      kind: kindFromCategory(d.category || ""),
      online: Boolean(d.online),
      source: "live",
      nativeId,
      connector: "smartlife",
      on: typeof switchStatus?.value === "boolean" ? switchStatus.value : false,
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
    if (prev.room === "その他" && d.room !== "その他") into.set(d.nativeId, d);
  }
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
    if (result) mergeDevices(bag, mapDevices(asDeviceList(result)));
  }

  let lastKey = "";
  for (let page = 0; page < 8; page++) {
    const q = lastKey
      ? `/v1.3/iot-03/devices?page_size=100&last_row_key=${encodeURIComponent(lastKey)}`
      : "/v1.3/iot-03/devices?page_size=100";
    const result = await tryGet(host, accessId, secret, q, token);
    if (!result) break;
    mergeDevices(bag, mapDevices(asDeviceList(result)));
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
    if (homeDevices) mergeDevices(bag, mapDevices(asDeviceList(homeDevices)));

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
      if (roomDevices) mergeDevices(bag, mapDevices(asDeviceList(roomDevices), room.name));
    }
  }

  return [...bag.values()];
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

/** Smart Life（Tuya）の操作。機器が実際に持つ switch 系のコードを見てから送る。 */
export async function tuyaControl(
  accessId: string,
  secret: string,
  region: string,
  device: Device,
  cmd: { on?: boolean },
) {
  if (cmd.on === undefined) {
    throw new Error(`${device.name} はオンとオフだけを操作できます`);
  }
  const dc = TUYA_REGIONS.find((r) => r.id === region);
  if (!dc) {
    throw new Error("Smart Life のデータセンターが未確定です。接続タブで一度同期してください。");
  }
  const token = await getToken(dc.host, accessId, secret);
  const status = await tuyaGet<Array<{ code: string; value: unknown }>>(
    dc.host,
    accessId,
    secret,
    `/v1.0/iot-03/devices/${device.nativeId}/status`,
    token.access_token,
  );
  const sw = status.find((s) => typeof s.value === "boolean" && s.code.startsWith("switch"));
  if (!sw) {
    throw new Error(`${device.name} にオンオフのスイッチがありません`);
  }
  await tuyaPost(
    dc.host,
    accessId,
    secret,
    `/v1.0/iot-03/devices/${device.nativeId}/commands`,
    token.access_token,
    { commands: [{ code: sw.code, value: cmd.on }] },
  );
}
