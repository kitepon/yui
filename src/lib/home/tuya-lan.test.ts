import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDpQuery,
  buildFrame,
  decodeDps,
  encryptPayload,
  parseFrame,
  parseTuyaLanDevices,
  readingsFromTuyaDps,
} from "./tuya-lan.ts";

const KEY = "0123456789abcdef";
const TARGET = { deviceId: "eb7096a6a56761b155qppj", host: "192.168.1.54", localKey: KEY };

test("YUI_TUYA_LAN_DEVICES は deviceId=IP:LOCALKEY をカンマ区切りで読む", () => {
  const list = parseTuyaLanDevices(` eb70=192.168.1.54:${KEY}, ab12=10.0.0.2:${KEY} `);
  assert.deepEqual(list, [
    { deviceId: "eb70", host: "192.168.1.54", localKey: KEY },
    { deviceId: "ab12", host: "10.0.0.2", localKey: KEY },
  ]);
  assert.deepEqual(parseTuyaLanDevices(undefined), []);
});

test("形が違う項目と 16 文字でない Local Key は typed error", () => {
  assert.throws(() => parseTuyaLanDevices("eb70=192.168.1.54"), /deviceId=IP:LOCALKEY/);
  assert.throws(() => parseTuyaLanDevices("eb70=192.168.1.54:short"), /16 文字/);
});

test("DP_QUERY は 55aa フレームで、CRC と末尾が揃う", () => {
  const frame = buildDpQuery(TARGET, 7, 1_700_000_000_000);
  const parsed = parseFrame(Buffer.concat([frame, Buffer.from("garbage")]));
  assert.ok(parsed);
  assert.equal(parsed.seq, 7);
  assert.equal(parsed.cmd, 0x0a);
  assert.equal(frame.readUInt32BE(12), frame.length - 16);
});

test("途中までの受信は undefined、壊れた CRC は typed error", () => {
  const frame = buildFrame(1, 0x0a, encryptPayload(KEY, Buffer.from("{}")));
  assert.equal(parseFrame(frame.subarray(0, frame.length - 3)), undefined);
  const broken = Buffer.from(frame);
  broken[20] ^= 0xff;
  assert.throws(() => parseFrame(broken), /CRC/);
});

test("実機 SNT957W-TDE の応答（retcode + 暗号本文）から dps を読む", () => {
  const body = encryptPayload(KEY, Buffer.from(JSON.stringify({ dps: { "1": 255, "9": "c" } })));
  const frame = buildFrame(1, 0x0a, Buffer.concat([Buffer.alloc(4), body]));
  const parsed = parseFrame(frame);
  assert.ok(parsed);
  assert.equal(parsed.retcode, 0);
  assert.deepEqual(decodeDps(KEY, parsed.data), { "1": 255, "9": "c" });
});

test("3.3 header 付きの本文も読める。鍵違いは typed error", () => {
  const body = encryptPayload(KEY, Buffer.from(JSON.stringify({ dps: { "1": 200 } })));
  const withHeader = Buffer.concat([Buffer.from("3.3"), Buffer.alloc(12), body]);
  assert.deepEqual(decodeDps(KEY, withHeader), { "1": 200 });
  assert.throws(() => decodeDps("fedcba9876543210", body), /復号できません/);
});

test("wsdcg の dp1 は十分の一度、dp9 が f なら摂氏へ", () => {
  assert.deepEqual(readingsFromTuyaDps({ "1": 255, "9": "c", "10": 1200 }), { temperature: 25.5, humidity: undefined });
  assert.deepEqual(readingsFromTuyaDps({ "1": 779, "2": 40, "9": "f" }), { temperature: 25.5, humidity: 40 });
  assert.deepEqual(readingsFromTuyaDps({ "9": "c" }), { temperature: undefined, humidity: undefined });
});
