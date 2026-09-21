import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";
import { createConnection } from "node:net";
import { crc32 } from "node:zlib";
import type { DevicePatch } from "./device-patch.ts";
import { applyTuyaStatus, tuyaCommandsFromPatch } from "./tuya.ts";
import type { Device, TuyaLocalDevice } from "./types.ts";

/**
 * Smart Life（Tuya）機器の LAN 直結。
 *
 * Tuya IoT Platform の登録は初回同期のためだけに使う。同期で受け取った Local Key と
 * dp 対応（`credentials.tuyaLocal`）を持つ機器は、以後クラウドを通さず、Smart Life アプリの
 * ローカル操作と同じプロトコル（TCP 6668、version 3.3、AES-128-ECB）で読み書きする。
 *
 * 機器の居場所は、機器自身が LAN へ 5 秒ごとに送る名乗り（UDP 6667、共通鍵で暗号化）を
 * 結が聞いて覚える。宛先を人が書くことはない。Docker では 6667/udp をホストへ公開する。
 *
 * 結が読み書きできるのは version 3.3 だけ。3.4 / 3.5 は握手が違うため LAN を使わず、
 * その機器はクラウドに残す（画面にはその版を出す）。
 *
 * 実機 SNT957W-TDE（CBU、category wsdcg）で読み取りを確定させた。
 */

const PORT = 6668;
const DISCOVERY_PORT = 6667;
const TIMEOUT_MS = 5000;
/** 名乗りが途切れてからこの時間は居場所を信じる。機器は 5 秒ごとに名乗る。 */
const SEEN_TTL_MS = 5 * 60 * 1000;
const PREFIX = 0x000055aa;
const SUFFIX = 0x0000aa55;
const CMD_CONTROL = 0x07;
const CMD_DP_QUERY = 0x0a;
const VERSION_HEADER_33 = Buffer.concat([Buffer.from("3.3"), Buffer.alloc(12)]);
/** UDP の名乗りは全機器共通のこの鍵で暗号化されている（tuya-convert が明らかにした値）。 */
const UDP_KEY = createHash("md5").update("yGAdlopoPVldABfn").digest();
const SUPPORTED_VERSION = "3.3";

export type TuyaLanTarget = {
  deviceId: string;
  host: string;
  localKey: string;
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

/** 3.3 の DP_QUERY。version header は付かず、本文だけ暗号化する。 */
export function buildDpQuery(target: TuyaLanTarget, seq = 1, now = Date.now()): Buffer {
  const body = JSON.stringify({
    gwId: target.deviceId,
    devId: target.deviceId,
    uid: target.deviceId,
    t: String(Math.floor(now / 1000)),
  });
  return buildFrame(seq, CMD_DP_QUERY, encryptPayload(target.localKey, Buffer.from(body, "utf8")));
}

/** 3.3 の CONTROL。暗号化した本文の前に "3.3"+12byte の header が付く。 */
export function buildControl(target: TuyaLanTarget, dps: Record<string, unknown>, seq = 1, now = Date.now()): Buffer {
  const body = JSON.stringify({
    devId: target.deviceId,
    uid: target.deviceId,
    t: String(Math.floor(now / 1000)),
    dps,
  });
  const payload = Buffer.concat([VERSION_HEADER_33, encryptPayload(target.localKey, Buffer.from(body, "utf8"))]);
  return buildFrame(seq, CMD_CONTROL, payload);
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

/** 応答本文を dps に読む。3.3 は "3.3"+12byte の header 付きで返ることがある。 */
export function decodeDps(localKey: string, data: Buffer): Record<string, unknown> {
  let text: string;
  try {
    text = decryptPayload(localKey, stripVersionHeader(data)).toString("utf8");
  } catch {
    throw new Error("Smart Life 直結: 応答を復号できません。Local Key が変わった（再ペアリング）なら接続タブで同期してください");
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

/** 機器へ 1 回つなぎ、1 フレーム送って最初の応答フレームを返す。 */
function exchange(target: TuyaLanTarget, frame: Buffer): Promise<TuyaLanFrame> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      socket.destroy();
      fn();
    };
    const socket = createConnection({ host: target.host, port: target.port ?? PORT }, () => {
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

/** 名乗りの datagram を読む。55aa フレームの本文（retcode の後）が共通鍵で暗号化されている。 */
export function decodeAnnouncement(datagram: Buffer): TuyaLanAnnouncement {
  const frame = parseFrame(datagram);
  if (!frame) throw new Error("Smart Life 直結: 名乗りが短すぎます");
  let text: string;
  try {
    text = decryptPayload(UDP_KEY, frame.data).toString("utf8");
  } catch {
    throw new Error("Smart Life 直結: 名乗りを復号できません");
  }
  const json = JSON.parse(text) as { gwId?: string; ip?: string; version?: string };
  if (!json.gwId || !json.ip || !json.version) throw new Error("Smart Life 直結: 名乗りに gwId / ip / version がありません");
  return { gwId: json.gwId, ip: json.ip, version: json.version };
}

const seen = new Map<string, TuyaLanSeen>();
let discoverySocket: Socket | undefined;
let discoveryError: string | undefined;

/** 探索の状態。画面へ出す。 */
export function tuyaLanDiscoveryStatus(): { listening: boolean; error?: string; seen: number } {
  return { listening: Boolean(discoverySocket) && !discoveryError, error: discoveryError, seen: seen.size };
}

/**
 * 名乗りを聞き始める。プロセスで一つ。bind に失敗したら理由を残して止まる（別の
 * プロセスが 6667 を握っている等）。読めない datagram は数えるだけで捨てる。
 */
export function startTuyaLanDiscovery(): void {
  if (discoverySocket) return;
  const socket = createSocket({ type: "udp4", reuseAddr: true });
  socket.on("message", (msg) => {
    try {
      const a = decodeAnnouncement(msg);
      seen.set(a.gwId, { host: a.ip, version: a.version, seenAt: Date.now() });
    } catch {
      /* Tuya 以外の datagram も同じポートへ来うる。読めないものは相手にしない。 */
    }
  });
  socket.on("error", (err) => {
    discoveryError = `LAN の探索が動いていません（UDP ${DISCOVERY_PORT}: ${err.message}）`;
    console.error("[yui] smartlife lan discovery", err.message);
  });
  socket.bind(DISCOVERY_PORT, () => {
    discoveryError = undefined;
  });
  discoverySocket = socket;
}

export function stopTuyaLanDiscovery(): void {
  discoverySocket?.close();
  discoverySocket = undefined;
  seen.clear();
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

/** LAN で読み書きできる機器か。鍵と dp 対応があり、名乗りを聞いており、版が 3.3 のとき。 */
export function tuyaLanTargetOf(
  device: Pick<Device, "connector" | "nativeId">,
  local: Record<string, TuyaLocalDevice> | undefined,
): (TuyaLanTarget & { dps: Record<string, string> }) | undefined {
  if (device.connector !== "smartlife") return undefined;
  const entry = local?.[device.nativeId];
  const where = lookupTuyaLan(device.nativeId);
  if (!entry || !where || where.version !== SUPPORTED_VERSION) return undefined;
  return { deviceId: device.nativeId, host: where.host, port: where.port, localKey: entry.localKey, dps: entry.dps };
}

/** 名乗りは聞こえるが結が扱えない版の機器。画面に版を出すために使う。 */
function unsupportedLanOf(device: Pick<Device, "connector" | "nativeId">) {
  if (device.connector !== "smartlife") return undefined;
  const where = lookupTuyaLan(device.nativeId);
  return where && where.version !== SUPPORTED_VERSION ? where : undefined;
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
 * 家の Smart Life センサーのうち LAN で読める機器を読み直し、`lan` に結果を残す。
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
        } else if (device.lan) {
          delete device.lan;
        }
        return;
      }
      if (device.kind !== "sensor") {
        device.lan = { host: target.host, version: SUPPORTED_VERSION, readAt: device.lan?.readAt, error: device.lan?.error };
        return;
      }
      try {
        const dps = await queryDps(target);
        applyTuyaStatus(device, statusFromDps(dps, target.dps));
        device.online = true;
        device.lan = { host: target.host, version: SUPPORTED_VERSION, readAt: new Date().toISOString() };
        read.add(device.id);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        device.lan = { host: target.host, version: SUPPORTED_VERSION, readAt: device.lan?.readAt, error: e.message };
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
