import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { registerHooks } from "node:module";
import { test } from "node:test";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE homes (id TEXT PRIMARY KEY, owner_user_id TEXT, pair_pin TEXT, credentials_enc TEXT, body_json TEXT, has_enabled_automation INTEGER, created_at TEXT, updated_at TEXT)");
const pending = [];
globalThis.__yuiDeviceStateTest = { db, pending };
process.env.HOME_SECRETS_KEY = "ab".repeat(32);
const root = new URL("../src/", import.meta.url);
const fixture = `data:text/javascript,${encodeURIComponent(`
  const state = globalThis.__yuiDeviceStateTest;
  export const getSqlite = () => state.db;
  export const remoControl = async (_token, device, patch) => new Promise(resolve => state.pending.push({ id: device.id, patch, resolve }));
  export const switchbotControl = async () => {};
  export const switchbotUsesBle = () => false;
  export const tuyaControl = async () => {};
  export const tuyaLanControl = async () => {};
  export const tuyaLanTargetOf = () => undefined;
  export const tuyaLanDiscoveryStatus = () => ({ listening: false, seen: 0 });
  export const odelicControl = async () => {};
  export const daikinControl = async () => {};
  export const daikinConfigured = () => false;
  export const isRetiredDaikinOutdoorId = () => false;
  export const homeBelongsToLanOwner = () => true;
  export const newWaveId = () => '';
  export const patchDetail = () => '';
  export const recordEvent = () => {};
  export const recordOnSample = () => {};
`)}`;
const mocks = new Set(["lib/server/sqlite", "lib/home/remo", "lib/home/switchbot", "lib/home/tuya", "lib/home/tuya-lan", "lib/home/odelic", "lib/home/daikin", "lib/server/lan-owner", "lib/server/analysis"].map(path => new URL(`${path}.ts`, root).href));
const hooks = registerHooks({ resolve(specifier, context, next) {
  let url;
  if (specifier.startsWith("@/")) url = new URL(`${specifier.slice(2)}.ts`, root).href;
  else if (specifier.startsWith(".") && context.parentURL?.startsWith(root.href)) url = new URL(specifier.endsWith(".ts") ? specifier : `${specifier}.ts`, context.parentURL).href;
  if (url) return { url: mocks.has(url) ? fixture : url, shortCircuit: true };
  return next(specifier, context);
} });
const { emptySnapshot } = await import("../src/lib/home/snapshot.ts");
const { encryptJson } = await import("../src/lib/server/home-secrets.ts");
const { loadHomeRecord, saveDeviceState, saveDeviceReadings, replaceHome } = await import("../src/lib/server/home-db.ts");
const { executeDevice } = await import("../src/lib/server/execute.ts");
hooks.deregister();

function seed() {
  db.exec("DELETE FROM homes");
  pending.length = 0;
  const snap = emptySnapshot();
  snap.devices = ["a", "b"].map(id => ({ id, name: id, room: "部屋", brand: "nature", nativeId: id, connector: "nature", source: "live", kind: "plug", online: true, on: id === "a" }));
  snap.automations = [];
  snap.overrides = {};
  db.prepare("INSERT INTO homes VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("home", "owner", "000000", encryptJson(Buffer.from(process.env.HOME_SECRETS_KEY, "hex"), snap.credentials), JSON.stringify(snap), 0, "", "");
  return snap;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("別の機器への操作が後から完了しても、先に保存したOFFは戻らない", async () => {
  const snap = seed();
  const a = executeDevice("home", snap, snap.devices[0], { on: false });
  const b = executeDevice("home", snap, snap.devices[1], { on: true });
  await flush();
  pending.find(x => x.id === "a").resolve();
  await a;
  pending.find(x => x.id === "b").resolve();
  await b;
  assert.deepEqual((await loadHomeRecord("home")).snap.devices.map(x => x.on), [false, true]);
});

test("同じ機器の操作は状態の保存まで順番に完了する", async () => {
  const snap = seed();
  const off = executeDevice("home", snap, snap.devices[0], { on: false });
  const on = executeDevice("home", snap, snap.devices[0], { on: true });
  await flush();
  assert.equal(pending.length, 1);
  pending[0].resolve();
  await off;
  await flush();
  assert.equal((await loadHomeRecord("home")).snap.devices[0].on, false);
  assert.equal(pending.length, 2);
  pending[1].resolve();
  await on;
  assert.equal((await loadHomeRecord("home")).snap.devices[0].on, true);
});

test("古い読取結果と読み飛ばした機器は最新の操作状態を上書きしない", async () => {
  const snap = seed();
  await saveDeviceState("home", "a", { on: false });
  const read = snap.devices.map(x => ({ ...x, temperature: 25, extra: "水温" }));
  const saved = await saveDeviceReadings("home", snap.devices, read);
  assert.equal(saved.devices[0].on, false);
  assert.equal(saved.devices[0].temperature, undefined);
  assert.equal(saved.devices[1].temperature, 25);
  assert.equal(saved.devices[1].extra, "水温");
  await saveDeviceReadings("home", snap.devices, snap.devices);
  assert.equal((await loadHomeRecord("home")).snap.devices[0].on, false);
});

test("Webの設定保存に古い機器状態が含まれていても実状態を保存し直さない", async () => {
  const snap = seed();
  await saveDeviceState("home", "a", { on: false });
  const saved = await replaceHome("owner", { ...snap, rooms: ["新しい部屋"] });
  assert.equal(saved.devices[0].on, false);
  assert.deepEqual(saved.rooms, ["新しい部屋"]);
});
