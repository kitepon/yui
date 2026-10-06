import assert from "node:assert/strict";
import { test } from "node:test";
import type { HomeSnapshot } from "../home/snapshot.ts";
import { parseNativeAutomation, parseNativeDeviceGroup, parseNativeSceneSteps } from "./native-edit.ts";

function home() {
  return { devices: [
    {
      id: "ac", name: "冷房", room: "リビング", brand: "daikin", kind: "ac", online: true,
      source: "live", nativeId: "ac", connector: "daikin", on: true, mode: "cool", targetTemp: 25,
      temperature: 26,
    },
    {
      id: "ir", name: "赤外線", room: "リビング", brand: "switchbot", kind: "ir", online: true,
      source: "live", nativeId: "ir", connector: "switchbot", on: true,
    },
  ], scenes: [{ id: "scene", name: "帰宅", hint: "", steps: [] }] } as HomeSnapshot;
}

test("iPhone の場面編集は温度などの操作を保存し、存在しない機器を拒む", () => {
  const snap = home();
  const steps = parseNativeSceneSteps([{ match: { id: "ac" }, patch: { on: true, mode: "cool", targetTemp: 24 } }], snap);
  assert.equal(steps?.[0].patch.targetTemp, 24);
  assert.equal(parseNativeSceneSteps([{ match: { id: "missing" }, patch: { on: true } }], snap), null);
});

test("実機が無い家ではデモ機器の場面を編集できる", () => {
  const snap = home();
  snap.devices = snap.devices.map((device) => ({ ...device, source: "demo" }));
  assert.ok(parseNativeSceneSteps([{ match: { id: "ac" }, patch: { on: true } }], snap));
});

test("機器操作が無い場面も自動化の起点として保存できる", () => {
  assert.deepEqual(parseNativeSceneSteps([], home()), []);
});

test("iPhone のオートメーションは範囲条件と読み返せる機器を検証する", () => {
  const snap = home();
  const draft = {
    name: "暑い日", enabled: true, stopOnMatch: true,
    trigger: { type: "sensor", deviceId: "ac", metric: "temperature", op: "between", value: 25, valueMax: 30 },
    actions: [{ id: "action", deviceId: "ac", on: true, mode: "cool", targetTemp: 24 }],
  };
  assert.equal(parseNativeAutomation(draft, snap)?.actions[0].targetTemp, 24);
  assert.equal(parseNativeAutomation({ ...draft, actions: [{ id: "action", deviceId: "ir", on: true }] }, snap), null);
  assert.equal(parseNativeAutomation({ ...draft, trigger: { ...draft.trigger, valueMax: 20 } }, snap), null);
});

test("iPhone の機器グループは実在する機器と分数を検証し、機器の重複を拒む", () => {
  const snap = home();
  snap.devices.push({ ...snap.devices[1], id: "sensor", kind: "sensor" });
  const draft = { name: " 換気扇 ", deviceIds: ["ac", "ir", "ac"], lockMinutes: 10 };
  assert.deepEqual(parseNativeDeviceGroup(draft, snap), { name: "換気扇", deviceIds: ["ac", "ir"], lockMinutes: 10 });
  assert.equal(parseNativeDeviceGroup({ ...draft, deviceIds: ["missing"] }, snap), null);
  assert.equal(parseNativeDeviceGroup({ ...draft, deviceIds: ["sensor"] }, snap), null);
  assert.equal(parseNativeDeviceGroup({ ...draft, deviceIds: [] }, snap), null);
  assert.equal(parseNativeDeviceGroup({ ...draft, name: " " }, snap), null);
  for (const lockMinutes of [0, 1.5, 1441]) assert.equal(parseNativeDeviceGroup({ ...draft, lockMinutes }, snap), null);

  snap.deviceGroups = [{ id: "fan", name: "換気扇", deviceIds: ["ac", "gone"], lockMinutes: 5 }];
  assert.equal(parseNativeDeviceGroup({ ...draft, deviceIds: ["ac"] }, snap), null);
  // 同期で一時的に消えた機器も、編集中のグループには残せる。
  assert.deepEqual(parseNativeDeviceGroup({ ...draft, deviceIds: ["ac", "gone"] }, snap, "fan")?.deviceIds, ["ac", "gone"]);
});
