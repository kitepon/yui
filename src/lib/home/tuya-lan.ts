import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { createConnection } from "node:net";
import { crc32 } from "node:zlib";
import type { DevicePatch } from "./device-patch.ts";
import { listenLanUdp, relayLanTcp, type ListenLanUdp } from "./lan-udp.ts";
import { applyTuyaStatus, tuyaCommandsFromPatch } from "./tuya.ts";
import type { Device, TuyaLocalDevice } from "./types.ts";

/**
 * Smart Life（Tuya）機器の LAN 直結。
 *
 * Tuya IoT Platform の登録は初回同期のためだけに使う。同期で受け取った Local Key と
 * dp 対応（`credentials.tuyaLocal`）を持つ機器は、以後クラウドを通さず、Smart Life アプリの
 * ローカル操作と同じプロトコル（TCP 6668、version 3.3、AES-128-ECB）で読み書きする。
 *
 * 機器の居場所は、機器自身が LAN へ 5 秒ごとに送る名乗り（3.1 は UDP 6666 に平文、
 * 3.3 以降は UDP 6667 に共通鍵で暗号化）を結が聞いて覚える。宛先を人が書くことはない。
 * Docker ではホストの LAN に直接開いた受け役が datagram を容器へ渡し、TCP 6668 の
 * 読み書きも受け役が中継する。容器から家の LAN へは届かない。受け口は、
 * アドレスかリンクが変わったときと、ソケットが死んだときに開き直す。
 *
 * 結が読み書きできるのは version 3.1 と 3.3。3.1 は読み取りが平文で、操作だけ鍵で暗号化して
 * md5 の署名を付ける。3.4 / 3.5 は握手が違うため LAN を使わず、その機器はクラウドに残す
 * （画面にはその版を出す）。
 *
 * 実機 SNT957W-TDE（CBU、wsdcg、3.3）で読み取りを、3.1 のコンセント（cz）で読み取りと操作を確定させた。
 */

const PORT = 6668;
const DISCOVERY_PORTS = [6666, 6667] as const;
const TIMEOUT_MS = 5000;
/**
 * 名乗りが途切れてからこの時間は居場所を信じる。3.3 は 5 秒ごとに名乗るが、3.1 の古い機器は
 * Smart Life アプリが LAN 接続を握っている間は名乗りを止める（実測で数分の空白）。
 * IP が変わっていれば読み書きが typed error になって画面に出るので、長めに信じてよい。
 */
const SEEN_TTL_MS = 30 * 60 * 1000;
const PREFIX = 0x000055aa;
const SUFFIX = 0x0000aa55;
const CMD_CONTROL = 0x07;
const CMD_DP_QUERY = 0x0a;
const VERSION_HEADER_33 = Buffer.concat([Buffer.from("3.3"), Buffer.alloc(12)]);
/** UDP の名乗りは全機器共通のこの鍵で暗号化されている（tuya-convert が明らかにした値）。 */
const UDP_KEY = createHash("md5").update("yGAdlopoPVldABfn").digest();
const SUPPORTED_VERSIONS = new Set(["3.1", "3.3"]);

export type TuyaLanVersion = "3.1" | "3.3";

export type TuyaLanTarget = {
  deviceId: string;
  host: string;
  localKey: string;
  version: TuyaLanVersion;
  /** 実機は常に 6668。テストで擬似機器を立てるときだけ変える。 */
  port?: number;
};

export function encryptPayload(localKey: string | Buffer, plain: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", typeof localKey === "string" ? Buffer.from(localKey, "utf8") : localKey, null);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

export function decryptPayload(localKey: string | Buffer, data: Buffer): Buffer {
  const decipher = createDecipheriv("aes-128-ecb", typeof localKey === "string" ? Buffer.from(localKey, "utf8") : localKey, null);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function buildFrame(seq: number, cmd: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(16);
  head.writeUInt32BE(PREFIX, 0);
  head.writeUInt32BE(seq, 4);
  head.writeUInt32BE(cmd, 8);
  head.writeUInt32BE(payload.length + 8, 12);
  const tail = Buffer.alloc(8);
  tail.writeUInt32BE(crc32(Buffer.concat([head, payload])), 0);
  tail.writeUInt32BE(SUFFIX, 4);
  return Buffer.concat([head, payload, tail]);
}

/** DP_QUERY。3.1 は平文、3.3 は本文だけ暗号化（version header は付かない）。 */
export function buildDpQuery(target: TuyaLanTarget, seq = 1, now = Date.now()): Buffer {
  const body = Buffer.from(
    JSON.stringify({
      gwId: target.deviceId,
      devId: target.deviceId,
      uid: target.deviceId,
      t: String(Math.floor(now / 1000)),
    }),
    "utf8",
  );
  return buildFrame(seq, CMD_DP_QUERY, target.version === "3.1" ? body : encryptPayload(target.localKey, body));
}

/**
 * CONTROL。3.3 は暗号化した本文の前に "3.3"+12byte の header。
 * 3.1 は base64 の暗号文に "3.1" と md5 署名（hex の 8..24 文字目）を前置する。
 */
export function buildControl(target: TuyaLanTarget, dps: Record<string, unknown>, seq = 1, now = Date.now()): Buffer {
  const body = Buffer.from(
    JSON.stringify({
      devId: target.deviceId,
      uid: target.deviceId,
      t: String(Math.floor(now / 1000)),
      dps,
    }),
    "utf8",
  );
  const encrypted = encryptPayload(target.localKey, body);
  if (target.version === "3.1") {
    const data = encrypted.toString("base64");
    const md5 = createHash("md5").update(`data=${data}||lpv=3.1||${target.localKey}`).digest("hex");
    return buildFrame(seq, CMD_CONTROL, Buffer.from(`3.1${md5.slice(8, 24)}${data}`, "utf8"));
  }
  return buildFrame(seq, CMD_CONTROL, Buffer.concat([VERSION_HEADER_33, encrypted]));
}

export type TuyaLanFrame = { seq: number; cmd: number; retcode: number; data: Buffer };

/** 先頭の 1 フレームを読む。足りなければ undefined、壊れていれば typed error。 */
export function parseFrame(buf: Buffer): TuyaLanFrame | undefined {
  if (buf.length < 24) return undefined;
  if (buf.readUInt32BE(0) !== PREFIX) throw new Error("Smart Life 直結: 応答の先頭が違います");
  const len = buf.readUInt32BE(12);
  const total = 16 + len;
  if (buf.length < total) return undefined;
  if (buf.readUInt32BE(total - 4) !== SUFFIX) throw new Error("Smart Life 直結: 応答の末尾が違います");
  const expected = buf.readUInt32BE(total - 8);
  if (crc32(buf.subarray(0, total - 8)) !== expected) throw new Error("Smart Life 直結: 応答の CRC が合いません");
  return {
    seq: buf.readUInt32BE(4),
    cmd: buf.readUInt32BE(8),
    retcode: buf.readUInt32BE(16),
    data: buf.subarray(20, total - 8),
  };
}

function stripVersionHeader(data: Buffer) {
  return data.subarray(0, 3).toString("latin1") === "3.3" ? data.subarray(15) : data;
}

/** 応答本文を dps に読む。3.1 は平文。3.3 は "3.3"+12byte の header 付きで返ることがある。 */
export function decodeDps(localKey: string, data: Buffer): Record<string, unknown> {
  let text: string;
  if (data.subarray(0, 1).toString("latin1") === "{") {
    text = data.toString("utf8");
  } else {
    try {
      text = decryptPayload(localKey, stripVersionHeader(data)).toString("utf8");
    } catch {
      throw new Error("Smart Life 直結: 応答を復号できません。Local Key が変わった（再ペアリング）なら接続タブで同期してください");
    }
  }
  let json: { dps?: Record<string, unknown> };
  try {
    json = JSON.parse(text) as { dps?: Record<string, unknown> };
  } catch {
    throw new Error("Smart Life 直結: 応答が JSON ではありません");
  }
  if (!json.dps || typeof json.dps !== "object") {
    throw new Error("Smart Life 直結: 応答に dps がありません");
  }
  return json.dps;
}

function parseExchange(buf: Buffer): TuyaLanFrame {
  const parsed = parseFrame(buf);
  if (!parsed) throw new Error("Smart Life 直結: 応答が短すぎます");
  return parsed;
}

/** 機器へ 1 回つなぎ、1 フレーム送って最初の応答フレームを返す。 */
async function exchange(target: TuyaLanTarget, frame: Buffer): Promise<TuyaLanFrame> {
  const relay = process.env.YUI_TUYA_LAN_RELAY?.trim();
  const port = target.port ?? PORT;
  if (relay) {
    return parseExchange(await relayLanTcp(relay, target.host, port, frame));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      socket.destroy();
      fn();
    };
    const socket = createConnection({ host: target.host, port }, () => {
      socket.write(frame);
    });
    socket.setTimeout(TIMEOUT_MS);
    socket.on("timeout", () =>
      finish(() => reject(new Error(`Smart Life 直結: ${target.host} が ${TIMEOUT_MS / 1000} 秒以内に応答しません`))),
    );
    socket.on("error", (err) => finish(() => reject(new Error(`Smart Life 直結: ${target.host} へ届きません（${err.message}）`))));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      let parsed: TuyaLanFrame | undefined;
      try {
        parsed = parseFrame(Buffer.concat(chunks));
      } catch (err) {
        finish(() => reject(err));
        return;
      }
      if (parsed) finish(() => resolve(parsed));
    });
    socket.on("close", () => finish(() => reject(new Error(`Smart Life 直結: ${target.host} が応答前に切断しました`))));
  });
}

/** 機器の dps を読む。 */
export async function queryDps(target: TuyaLanTarget): Promise<Record<string, unknown>> {
  const frame = await exchange(target, buildDpQuery(target));
  return decodeDps(target.localKey, frame.data);
}

/** 機器へ dps を送る。機器は受け取ると retcode 0 の CONTROL 応答を返す。 */
export async function sendDps(target: TuyaLanTarget, dps: Record<string, unknown>): Promise<void> {
  const frame = await exchange(target, buildControl(target, dps));
  if (frame.retcode !== 0) {
    throw new Error(`Smart Life 直結: 機器が操作を受け付けませんでした（code ${frame.retcode}）`);
  }
}

/* ---------- 居場所の探索（UDP 6667） ---------- */

export type TuyaLanSeen = { host: string; version: string; seenAt: number; port?: number };

export type TuyaLanAnnouncement = { gwId: string; ip: string; version: string };

/** 名乗りの datagram を読む。55aa フレームの本文（retcode の後）。3.1 は平文、3.3 以降は共通鍵で暗号化。 */
export function decodeAnnouncement(datagram: Buffer): TuyaLanAnnouncement {
  const frame = parseFrame(datagram);
  if (!frame) throw new Error("Smart Life 直結: 名乗りが短すぎます");
  let text: string;
  if (frame.data.subarray(0, 1).toString("latin1") === "{") {
    text = frame.data.toString("utf8");
  } else {
    try {
      text = decryptPayload(UDP_KEY, frame.data).toString("utf8");
    } catch {
      throw new Error("Smart Life 直結: 名乗りを復号できません");
    }
  }
  const json = JSON.parse(text) as { gwId?: string; ip?: string; version?: string };
  if (!json.gwId || !json.ip || !json.version) throw new Error("Smart Life 直結: 名乗りに gwId / ip / version がありません");
  return { gwId: json.gwId, ip: json.ip, version: json.version };
}

const seen = new Map<string, TuyaLanSeen>();
const listeningPorts = new Set<number>();
const discoveryErrors = new Map<number, string>();
let discovery: ListenLanUdp | undefined;

/** 探索の状態。画面へ出す。 */
export function tuyaLanDiscoveryStatus(): { listening: boolean; error?: string; seen: number } {
  const error = [...discoveryErrors.values()].join(" / ") || undefined;
  return { listening: listeningPorts.size > 0 && !error, error, seen: seen.size };
}

/**
 * 名乗りを聞き始める。プロセスで一つ。読めない datagram は捨てる。
 * アドレスかリンクが変わったとき、ソケットが死んだときは開き直す。覚えた居場所は消さない。
 */
export function startTuyaLanDiscovery(): void {
  if (discovery) return;
  discovery = listenLanUdp({
    ports: DISCOVERY_PORTS,
    onReset: () => {
      listeningPorts.clear();
      discoveryErrors.clear();
    },
    onPortListening: (port) => {
      listeningPorts.add(port);
      discoveryErrors.delete(port);
    },
    onPortError: (port, err) => {
      listeningPorts.delete(port);
      discoveryErrors.set(port, `LAN の探索が動いていません（UDP ${port}: ${err.message}）`);
    },
    onMessage: (msg) => {
      try {
        const a = decodeAnnouncement(msg);
        seen.set(a.gwId, { host: a.ip, version: a.version, seenAt: Date.now() });
      } catch {
        /* Tuya 以外の datagram も同じポートへ来うる。読めないものは相手にしない。 */
      }
    },
  });
}

export function stopTuyaLanDiscovery(): Promise<void> {
  const current = discovery;
  discovery = undefined;
  listeningPorts.clear();
  discoveryErrors.clear();
  seen.clear();
  return current ? current.close() : Promise.resolve();
}

/** テスト用。名乗りを直接入れる。擬似機器のポートも指せる。 */
export function noteTuyaLanAnnouncement(a: TuyaLanAnnouncement & { port?: number }, now = Date.now()) {
  seen.set(a.gwId, { host: a.ip, version: a.version, seenAt: now, port: a.port });
}

export function lookupTuyaLan(deviceId: string, now = Date.now()): TuyaLanSeen | undefined {
  const s = seen.get(deviceId);
  if (!s || now - s.seenAt > SEEN_TTL_MS) return undefined;
  return s;
}

/* ---------- 結の機器との接続 ---------- */

/** LAN で読み書きできる機器か。鍵と dp 対応があり、名乗りを聞いており、版が 3.1 か 3.3 のとき。 */
export function tuyaLanTargetOf(
  device: Pick<Device, "connector" | "nativeId">,
  local: Record<string, TuyaLocalDevice> | undefined,
): (TuyaLanTarget & { dps: Record<string, string> }) | undefined {
  if (device.connector !== "smartlife") return undefined;
  const entry = local?.[device.nativeId];
  const where = lookupTuyaLan(device.nativeId);
  if (!entry || !where || !SUPPORTED_VERSIONS.has(where.version)) return undefined;
  return {
    deviceId: device.nativeId,
    host: where.host,
    port: where.port,
    localKey: entry.localKey,
    version: where.version as TuyaLanVersion,
    dps: entry.dps,
  };
}

/** 名乗りは聞こえるが結が扱えない版の機器。画面に版を出すために使う。 */
function unsupportedLanOf(device: Pick<Device, "connector" | "nativeId">) {
  if (device.connector !== "smartlife") return undefined;
  const where = lookupTuyaLan(device.nativeId);
  return where && !SUPPORTED_VERSIONS.has(where.version) ? where : undefined;
}

/** dps（番号 → 値）を Tuya クラウドと同じ status（コード → 値）の並びにする。対応の無い番号は捨てる。 */
export function statusFromDps(dps: Record<string, unknown>, map: Record<string, string>) {
  const status: Array<{ code: string; value: unknown }> = [];
  for (const [id, value] of Object.entries(dps)) {
    const code = map[id];
    if (code) status.push({ code, value });
  }
  return status;
}

function dpsFromCommands(commands: Array<{ code: string; value: unknown }>, map: Record<string, string>) {
  const byCode = new Map(Object.entries(map).map(([id, code]) => [code, id]));
  const dps: Record<string, unknown> = {};
  for (const c of commands) {
    const id = byCode.get(c.code);
    if (id) dps[id] = c.value;
  }
  return dps;
}

/**
 * 家の Smart Life 機器のうち LAN で読める機器を読み直し、`lan` に結果を残す。
 * センサーは温度・湿度、スイッチ類は入／切を LAN の実値で更新する。
 * 読めた機器は返り値に含める（呼ぶ側はその機器をクラウドで読み直さない）。
 */
export async function tuyaLanRefreshSensors(
  devices: Device[],
  local: Record<string, TuyaLocalDevice> | undefined,
): Promise<{ read: Set<string>; errors: Error[] }> {
  const read = new Set<string>();
  const errors: Error[] = [];
  await Promise.all(
    devices.map(async (device) => {
      if (device.connector !== "smartlife") return;
      const unsupported = unsupportedLanOf(device);
      if (unsupported) {
        device.lan = { host: unsupported.host, version: unsupported.version, error: `version ${unsupported.version} は LAN で読めません（クラウドで読みます）` };
        return;
      }
      const target = tuyaLanTargetOf(device, local);
      if (!target) {
        const where = lookupTuyaLan(device.nativeId);
        if (where) {
          // LAN に居るのに鍵が無い。初回同期の前か、鍵を返さない一覧だった。
          device.lan = { host: where.host, version: where.version, error: "鍵がありません。接続タブで Smart Life を同期すると受け取ります" };
        } else if (device.lan?.readAt && Date.now() - Date.parse(device.lan.readAt) <= SEEN_TTL_MS) {
          // 名乗りは途切れる（3.1 はアプリやこちらの読み取り中に止まる）。直近に読めた印は残す。
        } else if (device.lan) {
          delete device.lan;
        }
        return;
      }
      try {
        const status = statusFromDps(await queryDps(target), target.dps);
        applyTuyaStatus(device, status);
        const sw = status.find((s) => typeof s.value === "boolean" && /^switch/.test(s.code));
        if (sw) device.on = sw.value as boolean;
        device.online = true;
        device.lan = { host: target.host, version: target.version, readAt: new Date().toISOString() };
        read.add(device.id);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        device.lan = { host: target.host, version: target.version, readAt: device.lan?.readAt, error: e.message };
        errors.push(e);
      }
    }),
  );
  return { read, errors };
}

/** LAN で操作する。機器がいま持つ dp を読んでから、結の操作をその dp に写して送る。 */
export async function tuyaLanControl(
  target: TuyaLanTarget & { dps: Record<string, string> },
  device: Device,
  cmd: DevicePatch,
): Promise<void> {
  const status = statusFromDps(await queryDps(target), target.dps);
  const commands = tuyaCommandsFromPatch(status, device, cmd);
  const dps = dpsFromCommands(commands, target.dps);
  if (!Object.keys(dps).length) {
    throw new Error(`${device.name} に送れる操作がありません`);
  }
  await sendDps(target, dps);
}
