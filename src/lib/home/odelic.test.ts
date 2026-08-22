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

test("状態にある短アドレスごとに照明を並べる", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  stub({
    ok: true,
    connected: true,
    authed: true,
    status: { "09 00 00 00": "0d 10", "01 00 00 00": "0d 10", "05 00 00 00": "14 13" },
  });
  const { devices, rooms } = await odelicSync();
  assert.equal(devices.length, 3);
  assert.deepEqual(devices.map((d) => d.nativeId), ["01000000", "05000000", "09000000"]);
  assert.deepEqual(devices.map((d) => d.name), [
    "オーデリック照明 1",
    "オーデリック照明 5",
    "オーデリック照明 9",
  ]);
  assert.equal(devices[2].brightness, 0x0d);
  assert.equal(devices[2].on, true);
  assert.deepEqual(rooms, ["リビング"]);
});

test("照明がまだ繋がっていなければ同期を成功にしない", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099";
  stub({ ok: true, connected: false, authed: false, status: {} });
  await assert.rejects(odelicSync(), /繋がっていません/);
});

test("末尾のスラッシュがあっても口を正しく組む", async () => {
  process.env.YUI_ODELIC_BRIDGE_URL = "http://ms-a2:8099/";
  const calls = stub({ ok: true, connected: true, authed: true, status: { "01 00 00 00": "0d 10" } });
  await odelicSync();
  assert.equal(calls[0], "http://ms-a2:8099/health");
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
  await assert.rejects(odelicControl({ ...light, nativeId: "" }, { on: false }), /宛先が分かりません/);
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
