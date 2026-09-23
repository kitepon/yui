import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { createHash } from "node:crypto";
import {
  buildControl,
  buildDpQuery,
  buildFrame,
  decodeAnnouncement,
  decodeDps,
  decryptPayload,
  encryptPayload,
  lookupTuyaLan,
  noteTuyaLanAnnouncement,
  parseFrame,
  statusFromDps,
  tuyaLanControl,
  tuyaLanRefreshSensors,
  tuyaLanTargetOf,
} from "./tuya-lan.ts";
import { startTuyaLanRelay } from "./lan-udp.ts";
import type { Device } from "./types.ts";

const KEY = "0123456789abcdef";
const ID = "eb7096a6a56761b155qppj";
const TARGET = { deviceId: ID, host: "192.168.1.54", localKey: KEY, version: "3.3" as const };
const UDP_KEY = createHash("md5").update("yGAdlopoPVldABfn").digest();
const WSDCG_DPS = { "1": "va_temperature", "2": "va_humidity", "9": "temp_unit_convert" };

function sensor(over: Partial<Device> = {}): Device {
  return {
    id: `smartlife:${ID}`,
    name: "水温計",
    room: "その他",
    brand: "smartlife",
    kind: "sensor",
    online: false,
    source: "live",
    nativeId: ID,
    connector: "smartlife",
    temperature: 20,
    ...over,
  };
}

test("DP_QUERY は 55aa フレームで、CRC と末尾が揃う", () => {
  const frame = buildDpQuery(TARGET, 7, 1_700_000_000_000);
  const parsed = parseFrame(Buffer.concat([frame, Buffer.from("garbage")]));
  assert.ok(parsed);
  assert.equal(parsed.seq, 7);
  assert.equal(parsed.cmd, 0x0a);
  assert.equal(frame.readUInt32BE(12), frame.length - 16);
});

test("CONTROL は 3.3 header 付きで dps を送る", () => {
  const frame = buildControl(TARGET, { "1": true }, 2, 1_700_000_000_000);
  const parsed = parseFrame(frame);
  assert.ok(parsed);
  assert.equal(parsed.cmd, 0x07);
  // 応答ではなく送信なので retcode 位置から本文。header "3.3" + 12 byte の後が暗号文。
  const body = frame.subarray(16, frame.length - 8);
  assert.equal(body.subarray(0, 3).toString(), "3.3");
  const json = JSON.parse(Buffer.from(decodeDpsRaw(KEY, body.subarray(15))).toString());
  assert.deepEqual(json.dps, { "1": true });
  assert.equal(json.devId, ID);
});

function decodeDpsRaw(key: string, data: Buffer) {
  return decryptPayload(key, data);
}

test("途中までの受信は undefined、壊れた CRC は typed error", () => {
  const frame = buildFrame(1, 0x0a, encryptPayload(KEY, Buffer.from("{}")));
  assert.equal(parseFrame(frame.subarray(0, frame.length - 3)), undefined);
  const broken = Buffer.from(frame);
  broken[20] ^= 0xff;
  assert.throws(() => parseFrame(broken), /CRC/);
});

test("実機の応答（retcode + 暗号本文、3.3 header あり／なし）から dps を読む。鍵違いは typed error", () => {
  const body = encryptPayload(KEY, Buffer.from(JSON.stringify({ dps: { "1": 255, "9": "c" } })));
  const frame = buildFrame(1, 0x0a, Buffer.concat([Buffer.alloc(4), body]));
  const parsed = parseFrame(frame);
  assert.ok(parsed);
  assert.equal(parsed.retcode, 0);
  assert.deepEqual(decodeDps(KEY, parsed.data), { "1": 255, "9": "c" });
  assert.deepEqual(decodeDps(KEY, Buffer.concat([Buffer.from("3.3"), Buffer.alloc(12), body])), { "1": 255, "9": "c" });
  assert.throws(() => decodeDps("fedcba9876543210", body), /復号できません/);
});

test("UDP 6667 の名乗りを共通鍵で読む", () => {
  const announce = { ip: "192.168.1.54", gwId: ID, active: 2, encrypt: true, productKey: "fqs8czlq3m0seqyp", version: "3.3" };
  const datagram = buildFrame(0, 0x13, Buffer.concat([Buffer.alloc(4), encryptPayload(UDP_KEY, Buffer.from(JSON.stringify(announce)))]));
  assert.deepEqual(decodeAnnouncement(datagram), { gwId: ID, ip: "192.168.1.54", version: "3.3" });
});

test("dps は同期で得た対応でクラウドと同じ status の並びになる。対応の無い番号は捨てる", () => {
  assert.deepEqual(statusFromDps({ "1": 255, "9": "c", "23": 0 }, WSDCG_DPS), [
    { code: "va_temperature", value: 255 },
    { code: "temp_unit_convert", value: "c" },
  ]);
});

test("名乗りを聞いた 3.3 の機器で鍵があるものだけ LAN の宛先になる。古い名乗りは信じない", () => {
  const local = { [ID]: { localKey: KEY, dps: WSDCG_DPS } };
  assert.equal(tuyaLanTargetOf(sensor(), local), undefined);
  noteTuyaLanAnnouncement({ gwId: ID, ip: "192.168.1.54", version: "3.3" });
  assert.deepEqual(tuyaLanTargetOf(sensor(), local), { deviceId: ID, host: "192.168.1.54", port: undefined, localKey: KEY, version: "3.3", dps: WSDCG_DPS });
  assert.equal(tuyaLanTargetOf(sensor(), {}), undefined);
  assert.equal(tuyaLanTargetOf({ connector: "switchbot", nativeId: ID }, local), undefined);
  noteTuyaLanAnnouncement({ gwId: ID, ip: "192.168.1.54", version: "3.4" });
  assert.equal(tuyaLanTargetOf(sensor(), local), undefined, "3.4 は LAN で扱わない");
  noteTuyaLanAnnouncement({ gwId: ID, ip: "192.168.1.54", version: "3.1" });
  assert.equal(tuyaLanTargetOf(sensor(), local)?.version, "3.1");
  noteTuyaLanAnnouncement({ gwId: ID, ip: "192.168.1.54", version: "3.3" }, Date.now() - 31 * 60 * 1000);
  assert.equal(lookupTuyaLan(ID), undefined);
});

test("名乗りが途切れても直近に読めた LAN 宛先で操作を続ける", () => {
  const local = { [ID]: { localKey: KEY, dps: WSDCG_DPS } };
  const fresh = sensor({ lan: { host: "192.168.1.54", version: "3.3", readAt: new Date().toISOString(), error: "前回は応答なし" } });
  assert.equal(tuyaLanTargetOf(fresh, local)?.host, "192.168.1.54");
  const stale = sensor({ lan: { host: "192.168.1.54", version: "3.3", readAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() } });
  assert.equal(tuyaLanTargetOf(stale, local), undefined);
  assert.equal(tuyaLanTargetOf(fresh, {}), undefined);
});

/** 擬似機器: DP_QUERY に dps を返し、CONTROL は受けた dps を控えて retcode 0 を返す。 */
function fakeDevice(dps: Record<string, unknown>) {
  const received: Record<string, unknown>[] = [];
  const server: Server = createServer((socket) => {
    socket.on("data", (buf) => {
      const frame = parseFrame(buf);
      if (!frame) return;
      if (frame.cmd === 0x0a) {
        const body = encryptPayload(KEY, Buffer.from(JSON.stringify({ dps })));
        socket.write(buildFrame(frame.seq, 0x0a, Buffer.concat([Buffer.alloc(4), body])));
      } else if (frame.cmd === 0x07) {
        const json = JSON.parse(decodeDpsRaw(KEY, frame.data.subarray(11)).toString()) as { dps: Record<string, unknown> };
        received.push(json.dps);
        socket.write(buildFrame(frame.seq, 0x07, Buffer.alloc(4)));
      }
    });
  });
  return new Promise<{ port: number; received: Record<string, unknown>[]; close: () => void }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, received, close: () => server.close() });
    });
  });
}

const servers: Array<() => void> = [];
after(() => servers.forEach((c) => c()));

test("受け役経由でも水温計の温度を読んでクラウドへ回さない", async () => {
  const dev = await fakeDevice({ "1": 261, "9": "c" });
  servers.push(dev.close);
  const relay = startTuyaLanRelay("127.0.0.1:0");
  assert.ok(relay);
  servers.push(() => void relay.close());
  await relay.ready;
  const prev = process.env.YUI_TUYA_LAN_RELAY;
  process.env.YUI_TUYA_LAN_RELAY = relay.url;
  try {
    noteTuyaLanAnnouncement({ gwId: ID, ip: "127.0.0.1", version: "3.3", port: dev.port });
    const d = sensor({ extra: "wsdcg", temperature: 25.1 });
    const res = await tuyaLanRefreshSensors([d], { [ID]: { localKey: KEY, dps: WSDCG_DPS } });
    assert.deepEqual(res.errors, []);
    assert.deepEqual([...res.read], [d.id]);
    assert.equal(d.temperature, 26.1);
    assert.equal(d.extra, "水温");
  } finally {
    if (prev === undefined) delete process.env.YUI_TUYA_LAN_RELAY;
    else process.env.YUI_TUYA_LAN_RELAY = prev;
  }
});

test("LAN で読めたセンサーは温度が入り lan.readAt が付き、クラウドへ回さない一覧に載る", async () => {
  const dev = await fakeDevice({ "1": 255, "9": "c", "10": 1200 });
  servers.push(dev.close);
  noteTuyaLanAnnouncement({ gwId: ID, ip: "127.0.0.1", version: "3.3", port: dev.port });
  const d = sensor();
  const other = sensor({ id: "smartlife:x", nativeId: "x", name: "別の機器" });
  const res = await tuyaLanRefreshSensors([d, other], { [ID]: { localKey: KEY, dps: WSDCG_DPS } });
  assert.deepEqual(res.errors, []);
  assert.deepEqual([...res.read], [d.id]);
  assert.equal(d.temperature, 25.5);
  assert.equal(d.online, true);
  assert.equal(d.lan?.host, "127.0.0.1");
  assert.ok(d.lan?.readAt);
  assert.equal(d.lan?.error, undefined);
  assert.equal(other.lan, undefined, "名乗りの無い機器には lan を付けない");
});

test("名乗りが途切れても直近の LAN 宛先を試し、30 分より前の印は消す", async () => {
  noteTuyaLanAnnouncement({ gwId: ID, ip: "192.168.1.54", version: "3.3" }, Date.now() - 31 * 60 * 1000);
  const fresh = sensor({ lan: { host: "127.0.0.1", version: "3.3", readAt: new Date().toISOString() } });
  const stale = sensor({
    id: "smartlife:old",
    nativeId: "old-sensor",
    lan: { host: "192.168.1.99", version: "3.3", readAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() },
  });
  const res = await tuyaLanRefreshSensors([fresh, stale], { [ID]: { localKey: KEY, dps: WSDCG_DPS } });
  assert.deepEqual([...res.attempted], [fresh.id]);
  assert.match(fresh.lan?.error ?? "", /届きません|応答/);
  assert.equal(stale.lan, undefined);
});

test("届かない機器は lan.error に理由が残り、値は前のまま。他の機器は止めない", async () => {
  noteTuyaLanAnnouncement({ gwId: ID, ip: "127.0.0.1", version: "3.3", port: 1 });
  const d = sensor({ temperature: 21.5 });
  const res = await tuyaLanRefreshSensors([d], { [ID]: { localKey: KEY, dps: WSDCG_DPS } });
  assert.equal(res.errors.length, 1);
  assert.deepEqual([...res.attempted], [d.id], "LAN 失敗時もクラウドの対象にはしない");
  assert.equal(d.temperature, 21.5);
  assert.match(d.lan?.error ?? "", /届きません|応答/);
});

test("LAN の操作は機器の dp を読んでから、結の操作をその dp 番号で送る", async () => {
  const dev = await fakeDevice({ "1": false, "9": 0 });
  servers.push(dev.close);
  const plugId = "plug1";
  noteTuyaLanAnnouncement({ gwId: plugId, ip: "127.0.0.1", version: "3.3", port: dev.port });
  const plug = sensor({ id: `smartlife:${plugId}`, nativeId: plugId, kind: "plug", name: "水流", extra: "cz" });
  const target = tuyaLanTargetOf(plug, { [plugId]: { localKey: KEY, dps: { "1": "switch_1", "9": "countdown_1" } } });
  assert.ok(target);
  await tuyaLanControl(target, { ...plug, on: true }, { on: true });
  assert.deepEqual(dev.received, [{ "1": true }]);
});

/* ---------- 3.1（実機: 0220… のコンセント、cz） ---------- */

const PLUG = "02200216ecfabc8794dd";
const PLUG_KEY = "fedcba9876543210";

test("3.1 の名乗りは UDP 6666 に平文で来る", () => {
  const announce = { ip: "192.168.1.8", gwId: PLUG, active: 2, ability: 0, mode: 0, encrypt: true, productKey: "ahg3J1WYWKKAWA1L", version: "3.1" };
  const datagram = buildFrame(0, 0x13, Buffer.concat([Buffer.alloc(4), Buffer.from(JSON.stringify(announce))]));
  assert.deepEqual(decodeAnnouncement(datagram), { gwId: PLUG, ip: "192.168.1.8", version: "3.1" });
});

test("3.1 の DP_QUERY は平文、応答も平文で読む", () => {
  const target = { deviceId: PLUG, host: "192.168.1.8", localKey: PLUG_KEY, version: "3.1" as const };
  const frame = buildDpQuery(target, 3, 1_700_000_000_000);
  const parsed = parseFrame(frame);
  assert.ok(parsed);
  const body = frame.subarray(16, frame.length - 8);
  assert.equal(JSON.parse(body.toString()).devId, PLUG);
  assert.deepEqual(decodeDps(PLUG_KEY, Buffer.from(JSON.stringify({ devId: PLUG, dps: { "1": true, "2": 0 } }))), { "1": true, "2": 0 });
});

test("3.1 の CONTROL は \"3.1\" + md5 署名 16 文字 + base64 暗号文", () => {
  const target = { deviceId: PLUG, host: "192.168.1.8", localKey: PLUG_KEY, version: "3.1" as const };
  const frame = buildControl(target, { "1": false }, 4, 1_700_000_000_000);
  const body = frame.subarray(16, frame.length - 8).toString();
  assert.equal(body.slice(0, 3), "3.1");
  const sig = body.slice(3, 19);
  const data = body.slice(19);
  const md5 = createHash("md5").update(`data=${data}||lpv=3.1||${PLUG_KEY}`).digest("hex");
  assert.equal(sig, md5.slice(8, 24));
  const json = JSON.parse(decryptPayload(PLUG_KEY, Buffer.from(data, "base64")).toString());
  assert.deepEqual(json.dps, { "1": false });
});

/** 3.1 の擬似コンセント。DP_QUERY に平文で答え、CONTROL は署名を検証してから dps を控える。 */
function fakePlug31(dps: Record<string, unknown>) {
  const received: Record<string, unknown>[] = [];
  const server: Server = createServer((socket) => {
    socket.on("data", (buf) => {
      const frame = parseFrame(buf);
      if (!frame) return;
      if (frame.cmd === 0x0a) {
        socket.write(buildFrame(frame.seq, 0x0a, Buffer.concat([Buffer.alloc(4), Buffer.from(JSON.stringify({ devId: PLUG, dps }))])));
      } else if (frame.cmd === 0x07) {
        // 送信フレームには retcode が無いので、parseFrame の data は本文の 5 文字目から。
        const body = buf.subarray(16, buf.length - 8).toString();
        const data = body.slice(19);
        const md5 = createHash("md5").update(`data=${data}||lpv=3.1||${PLUG_KEY}`).digest("hex");
        if (body.slice(0, 3) !== "3.1" || body.slice(3, 19) !== md5.slice(8, 24)) {
          socket.write(buildFrame(frame.seq, 0x07, Buffer.from([0, 0, 0, 1])));
          return;
        }
        received.push((JSON.parse(decryptPayload(PLUG_KEY, Buffer.from(data, "base64")).toString()) as { dps: Record<string, unknown> }).dps);
        socket.write(buildFrame(frame.seq, 0x07, Buffer.alloc(4)));
      }
    });
  });
  return new Promise<{ port: number; received: Record<string, unknown>[]; close: () => void }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ port: (server.address() as { port: number }).port, received, close: () => server.close() });
    });
  });
}

test("3.1 のコンセントは LAN で読んで、署名付きで操作を送れる", async () => {
  const dev = await fakePlug31({ "1": true, "2": 0 });
  servers.push(dev.close);
  noteTuyaLanAnnouncement({ gwId: PLUG, ip: "127.0.0.1", version: "3.1", port: dev.port });
  const plug = sensor({ id: `smartlife:${PLUG}`, nativeId: PLUG, kind: "plug", name: "90cm水槽の水流", extra: "cz", on: true });
  const target = tuyaLanTargetOf(plug, { [PLUG]: { localKey: PLUG_KEY, dps: { "1": "switch_1", "2": "countdown_1" } } });
  assert.ok(target);
  assert.equal(target.version, "3.1");
  await tuyaLanControl(target, { ...plug, on: false }, { on: false });
  assert.deepEqual(dev.received, [{ "1": false }]);
});

test("コンセントも毎回 LAN で読み、入／切を実値にして前回の失敗理由を消す", async () => {
  const dev = await fakePlug31({ "1": false, "2": 0 });
  servers.push(dev.close);
  noteTuyaLanAnnouncement({ gwId: PLUG, ip: "127.0.0.1", version: "3.1", port: dev.port });
  const plug = sensor({
    id: `smartlife:${PLUG}`,
    nativeId: PLUG,
    kind: "plug",
    name: "90cm水槽の水流",
    on: true,
    lan: { host: "127.0.0.1", version: "3.1", error: "鍵がありません。接続タブで Smart Life を同期すると受け取ります" },
  });
  const res = await tuyaLanRefreshSensors([plug], { [PLUG]: { localKey: PLUG_KEY, dps: { "1": "switch_1", "2": "countdown_1" } } });
  assert.deepEqual(res.errors, []);
  assert.equal(plug.on, false);
  assert.equal(plug.lan?.error, undefined);
  assert.ok(plug.lan?.readAt);
});
