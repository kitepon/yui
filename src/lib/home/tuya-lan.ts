import { createCipheriv, createDecipheriv } from "node:crypto";
import { createConnection } from "node:net";
import { crc32 } from "node:zlib";
import type { Device } from "./types.ts";

/**
 * Smart Life（Tuya）センサーの LAN 直結（読み取り）。
 *
 * Tuya IoT Core の試用枠が尽きるとクラウド経由のセンサー更新は止まる。同じ LAN に
 * いる結は、Smart Life アプリがローカル操作に使うのと同じプロトコル（TCP 6668、
 * version 3.3、AES-128-ECB）で機器から直接 dps を読める。宛先と Local Key は
 * `YUI_TUYA_LAN_DEVICES` が持つ（例: "eb7096…qppj=192.168.1.54:LOCALKEY16chars"）。
 * 設定しない限り結の image に LAN 直結の痕跡は出ない。
 *
 * Local Key は機器を再ペアリングするまで変わらない。取得は Tuya IoT Platform または
 * Smart Life アカウントの QR ログイン（tuya-device-sharing-sdk）で利用者が行う。
 *
 * 対応は実機 SNT957W-TDE（CBU、category wsdcg）で確定させた 3.3 だけ。
 * 3.4 / 3.5 は握手が違うため、応答が復号できないときは typed error で止める。
 * dp の意味は wsdcg 標準（1 = 温度×10、2 = 湿度、9 = 単位 c/f）。
 */

const NOT_CONFIGURED = "Smart Life 直結（YUI_TUYA_LAN_DEVICES）が未設定です。";
const PORT = 6668;
const TIMEOUT_MS = 5000;
const PREFIX = 0x000055aa;
const SUFFIX = 0x0000aa55;
const CMD_DP_QUERY = 0x0a;

export type TuyaLanTarget = { deviceId: string; host: string; localKey: string };

/** "id=IP:KEY,id=IP:KEY" を宛先の並びに読む。形が違う項目は typed error。 */
export function parseTuyaLanDevices(raw: string | undefined): TuyaLanTarget[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = /^([^=\s]+)=([^:\s]+):(\S+)$/.exec(entry);
      if (!m) {
        throw new Error(`YUI_TUYA_LAN_DEVICES の形が違います（deviceId=IP:LOCALKEY）: ${entry}`);
      }
      const [, deviceId, host, localKey] = m;
      if (Buffer.byteLength(localKey, "utf8") !== 16) {
        throw new Error(`Local Key は 16 文字です: ${deviceId}`);
      }
      return { deviceId, host, localKey };
    });
}

export function tuyaLanConfigured(): boolean {
  return parseTuyaLanDevices(process.env.YUI_TUYA_LAN_DEVICES).length > 0;
}

export function encryptPayload(localKey: string, plain: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", Buffer.from(localKey, "utf8"), null);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

export function decryptPayload(localKey: string, data: Buffer): Buffer {
  const decipher = createDecipheriv("aes-128-ecb", Buffer.from(localKey, "utf8"), null);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** 3.3 の DP_QUERY。version header は付かず、本文だけ暗号化する。 */
export function buildDpQuery(target: TuyaLanTarget, seq = 1, now = Date.now()): Buffer {
  const body = JSON.stringify({
    gwId: target.deviceId,
    devId: target.deviceId,
    uid: target.deviceId,
    t: String(Math.floor(now / 1000)),
  });
  const payload = encryptPayload(target.localKey, Buffer.from(body, "utf8"));
  return buildFrame(seq, CMD_DP_QUERY, payload);
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

/** 応答本文を dps に読む。3.3 は "3.3"+12byte の header 付きで返ることがある。 */
export function decodeDps(localKey: string, data: Buffer): Record<string, unknown> {
  const body = data.subarray(0, 3).toString("latin1") === "3.3" ? data.subarray(15) : data;
  let text: string;
  try {
    text = decryptPayload(localKey, body).toString("utf8");
  } catch {
    throw new Error("Smart Life 直結: 応答を復号できません。Local Key か version（3.3 のみ対応）を確認してください");
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

/** 機器へ 1 回つないで dps を読む。 */
export function queryDps(target: TuyaLanTarget): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      socket.destroy();
      fn();
    };
    const socket = createConnection({ host: target.host, port: PORT }, () => {
      socket.write(buildDpQuery(target));
    });
    socket.setTimeout(TIMEOUT_MS);
    socket.on("timeout", () =>
      finish(() => reject(new Error(`Smart Life 直結: ${target.host} が ${TIMEOUT_MS / 1000} 秒以内に応答しません`))),
    );
    socket.on("error", (err) => finish(() => reject(new Error(`Smart Life 直結: ${target.host} へ届きません（${err.message}）`))));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      let frame: TuyaLanFrame | undefined;
      try {
        frame = parseFrame(Buffer.concat(chunks));
      } catch (err) {
        finish(() => reject(err));
        return;
      }
      if (!frame) return;
      finish(() => {
        try {
          resolve(decodeDps(target.localKey, frame.data));
        } catch (err) {
          reject(err);
        }
      });
    });
    socket.on("close", () => finish(() => reject(new Error(`Smart Life 直結: ${target.host} が応答前に切断しました`))));
  });
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

/** wsdcg 標準 dp: 1 = 温度×10、2 = 湿度、9 = 単位（c/f）。 */
export function readingsFromTuyaDps(dps: Record<string, unknown>): { temperature?: number; humidity?: number } {
  const rawTemp = asNumber(dps["1"]);
  const humidity = asNumber(dps["2"]);
  let temperature = rawTemp != null ? rawTemp / 10 : undefined;
  if (temperature != null && dps["9"] === "f") {
    temperature = Math.round((((temperature - 32) * 5) / 9) * 10) / 10;
  }
  return { temperature, humidity };
}

/**
 * 家に入っている Smart Life センサーのうち、宛先が設定されたものだけ LAN で読み直す。
 * クラウドの値より後に当てる。届かない機器は typed error を集めて返し、他の機器は止めない。
 */
export async function tuyaLanRefreshSensors(devices: Device[]): Promise<Error[]> {
  const targets = parseTuyaLanDevices(process.env.YUI_TUYA_LAN_DEVICES);
  if (!targets.length) throw new Error(NOT_CONFIGURED);
  const errors: Error[] = [];
  await Promise.all(
    targets.map(async (target) => {
      const device = devices.find(
        (d) => d.connector === "smartlife" && d.nativeId === target.deviceId && d.kind === "sensor",
      );
      if (!device) return;
      try {
        const reading = readingsFromTuyaDps(await queryDps(target));
        if (reading.temperature != null) device.temperature = reading.temperature;
        if (reading.humidity != null) device.humidity = reading.humidity;
        device.online = true;
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }),
  );
  return errors;
}
