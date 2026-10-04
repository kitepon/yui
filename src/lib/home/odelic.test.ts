import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { odelicSync, odelicControl } from "./odelic.ts";
import type { Device } from "./types.ts";

const realFetch = globalThis.fetch;
const realUrl = process.env.YUI_ODELIC_BRIDGE_URL;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realUrl === undefined) delete process.env.YUI_ODELIC_BRIDGE_URL;
  else process.env.YUI_ODELIC_BRIDGE_URL = realUrl;
});

function stub(body: unknown, ok = true, status = 200) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return { ok, status, json: async () => body } as Response;
  }) as typeof fetch;
  return calls;
}

const light: Device = {
  id: "odelec:05000000",
  name: "オーデリック照明 5",
  room: "リビング",
  brand: "odelec",
  kind: "light",
  online: true,
  source: "live",
  nativeId: "05000000",
  connector: "odelec",
};

test("ブリッジのURLが未設定なら、その旨を投げる", async () => {
  delete process.env.YUI_ODELIC_BRIDGE_URL;
  await assert.rejects(odelicSync(), /YUI_ODELIC_BRIDGE_URL/);
});

test("登録0台から電波スキャンで状態未取得の照明も登録する", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  stub({
    ok: true,
    connected: true,
    lights: [
      { id: "09000000", online: true, on: true, brightness: 13 },
      { id: "01000000", online: true, on: true, brightness: 13 },
      { id: "05000000", online: true },
    ],
  });
  const { devices, rooms } = await odelicSync();
  assert.equal(devices.length, 3);
  assert.deepEqual(
    devices.map((d) => d.nativeId),
    ["01000000", "05000000", "09000000"],
  );
  assert.deepEqual(
    devices.map((d) => d.name),
    ["オーデリック照明 1", "オーデリック照明 2", "オーデリック照明 3"],
  );
  assert.equal(devices[2].brightness, 0x0d);
  assert.equal(devices[2].on, true);
  assert.equal(devices[1].on, undefined);
  assert.equal(devices[1].extra, "状態未取得");
  assert.deepEqual(rooms, ["リビング"]);
});

test("接続や状態通知の成立前でも電波で検出した照明を登録する", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  stub({ ok: true, connected: false, lights: [{ id: "020000000001", online: false }] });
  const { devices } = await odelicSync();
  assert.equal(devices.length, 1);
  assert.equal(devices[0].nativeId, "020000000001");
  assert.equal(devices[0].online, false);
});

test("状態通知のない照明も登録を残し、接続中のブリッジから操作できる", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  stub({
    ok: true,
    connected: true,
    lights: [
      { id: "01000000", online: true, on: true, brightness: 13 },
      { id: "09000000", online: true, on: true, brightness: 13 },
      { id: "05000000", online: true },
    ],
  });
  const registered = { ...light, name: "キッチン照明", room: "キッチン", on: false, online: false };
  const { devices, rooms } = await odelicSync([registered]);
  const kitchen = devices.find((device) => device.id === registered.id);
  assert.equal(devices.length, 3);
  assert.equal(kitchen?.nativeId, registered.nativeId);
  assert.equal(kitchen?.name, "キッチン照明");
  assert.equal(kitchen?.room, "キッチン");
  assert.equal(kitchen?.online, true);
  assert.equal(kitchen?.extra, "状態未取得");
  assert.ok(rooms.includes("キッチン"));
});

test("末尾のスラッシュがあっても口を正しく組む", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099/";
  const calls = stub({
    ok: true,
    connected: true,
    lights: [{ id: "01000000", online: true, on: true, brightness: 13 }],
  });
  await odelicSync();
  assert.equal(calls[0], "http://ms-a2:8099/lights/scan");
});

test("オンとオフは、その照明だけを指す口を叩く", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  const on = stub({ ok: true, sent: true, deferred: false });
  await odelicControl(light, { on: true });
  assert.equal(on[0], "http://ms-a2:8099/lights/05000000/on");

  const off = stub({ ok: true, sent: true, deferred: false });
  await odelicControl(light, { on: false });
  assert.equal(off[0], "http://ms-a2:8099/lights/05000000/off");
});

test("宛先の違う照明は別々の口になる（全灯へ流さない）", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  const calls = stub({ ok: true, sent: true, deferred: false });
  await odelicControl(light, { on: true });
  await odelicControl({ ...light, id: "odelec:09000000", nativeId: "09000000" }, { on: true });
  assert.deepEqual(calls, [
    "http://ms-a2:8099/lights/05000000/on",
    "http://ms-a2:8099/lights/09000000/on",
  ]);
});

test("宛先が空なら全灯へ送らず断る", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  const calls = stub({ ok: true, sent: true, deferred: false });
  await assert.rejects(
    odelicControl({ ...light, nativeId: "" }, { on: false }),
    /宛先が分かりません/,
  );
  assert.deepEqual(calls, [], "宛先不明で全灯を動かしてはいけない");
});

test("向きの無い指示は受け付けない", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  await assert.rejects(odelicControl(light, {}), /オンとオフだけ/);
});

test("保留になったら成功として黙らせない", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  stub({ ok: true, sent: false, deferred: true });
  await assert.rejects(odelicControl(light, { on: false }), /送れませんでした/);
});

test("ブリッジがエラーを返したらHTTP状態を添えて投げる", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  stub({}, false, 503);
  await assert.rejects(odelicSync(), /HTTP 503/);
});

test("繰り返しスキャンしても固定ID・改名・部屋を保ち、重複を増やさない", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  const registered = {
    ...light,
    id: "odelec:020000000001",
    nativeId: "020000000001",
    name: "キッチンの灯り",
    room: "キッチン",
  };
  stub({
    ok: true,
    connected: true,
    lights: [{ id: "020000000001", online: true, on: false, brightness: 0 }],
  });
  const first = await odelicSync([registered]);
  const second = await odelicSync(first.devices);
  assert.equal(second.devices.length, 1);
  assert.equal(second.devices[0].id, registered.id);
  assert.equal(second.devices[0].name, registered.name);
  assert.equal(second.devices[0].room, registered.room);
  assert.equal(second.devices[0].on, false);
});

test("今回電波を受信できなかった登録も残し、未検出と明示する", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  stub({ ok: true, connected: true, lights: [] });
  const result = await odelicSync([{ ...light, name: "キッチン照明", room: "キッチン" }]);
  assert.equal(result.devices.length, 1);
  assert.equal(result.devices[0].name, "キッチン照明");
  assert.equal(result.devices[0].online, false);
  assert.equal(result.devices[0].extra, "今回のスキャンでは未検出");
});
