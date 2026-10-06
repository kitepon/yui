import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GROUP_LOCK_MINUTES_MAX,
  clearGroupPendings,
  deferGroupActions,
  deviceGroupLock,
  dueGroupPendings,
  groupLockNote,
  normalizeDeviceGroups,
  partitionGroupLocked,
  pruneGroupStates,
  stampGroupOperation,
} from "./device-group.ts";
import type { Automation, Device, DeviceGroup } from "./types.ts";

const T0 = Date.parse("2026-10-06T00:00:00.000Z");
const MIN = 60 * 1000;
const at = (ms: number) => new Date(ms).toISOString();

const fan: DeviceGroup = { id: "fan", name: "換気扇", deviceIds: ["fan-on", "fan-off"], lockMinutes: 10 };

function ir(id: string): Device {
  return {
    id, name: id, room: "台所", brand: "nature", kind: "ir", online: true,
    source: "live", nativeId: id, connector: "nature",
  };
}

function plug(id: string, on: boolean): Device {
  return { ...ir(id), kind: "plug", connector: "smartlife", brand: "smartlife", on };
}

function sensorAuto(id: string, deviceId: string, passing: boolean): Automation {
  return {
    id,
    name: id,
    enabled: true,
    trigger: { type: "sensor", deviceId: "humid", metric: "humidity", op: "gte", value: 60 },
    actions: [{ id: `${id}-act`, deviceId, on: true }],
    lastFiredKey: `humid:humidity:gte:60::${passing ? "pass" : "fail"}`,
  };
}

function home(automations: Automation[], states: Record<string, unknown>, devices = [ir("fan-on"), ir("fan-off")]) {
  return {
    deviceGroups: [fan],
    deviceGroupStates: states as ReturnType<typeof pruneGroupStates>,
    automations,
    devices,
    lastScene: null as string | null,
  };
}

test("グループの形を揃え、機器は最初に入れたグループだけに残す", () => {
  const groups = normalizeDeviceGroups([
    { id: "a", name: " 換気扇 ", deviceIds: ["x", "y", "x", 3, ""], lockMinutes: 4.6 },
    { id: "b", name: "", deviceIds: ["y", "z"], lockMinutes: 99999 },
    { id: "a", name: "重複", deviceIds: ["w"], lockMinutes: 1 },
    { name: "id なし", deviceIds: ["v"], lockMinutes: 1 },
    null,
  ]);
  assert.deepEqual(groups, [
    { id: "a", name: "換気扇", deviceIds: ["x", "y"], lockMinutes: 5 },
    { id: "b", name: "グループ", deviceIds: ["z"], lockMinutes: GROUP_LOCK_MINUTES_MAX },
  ]);
  assert.deepEqual(normalizeDeviceGroups(undefined), []);
  assert.equal(normalizeDeviceGroups([{ id: "c", deviceIds: [], lockMinutes: 0 }])[0].lockMinutes, 1);
});

test("グループのどれかを動かすと、決めた時間は全部の機器を止める", () => {
  const states = stampGroupOperation([fan], {}, "fan-on", at(T0));
  assert.equal(deviceGroupLock([fan], states, "fan-off", T0 + MIN)?.until, T0 + 10 * MIN);
  assert.equal(deviceGroupLock([fan], states, "fan-on", T0 + 10 * MIN - 1)?.group.id, "fan");
  assert.equal(deviceGroupLock([fan], states, "fan-off", T0 + 10 * MIN), null);
  assert.equal(deviceGroupLock([fan], states, "lamp", T0 + MIN), null);
});

test("時計が戻って記録が未来にあるときは止めない", () => {
  const states = stampGroupOperation([fan], {}, "fan-on", at(T0));
  assert.equal(deviceGroupLock([fan], states, "fan-off", T0 - MIN), null);
  assert.equal(deviceGroupLock([fan], { fan: { operatedAt: "壊れた値", deviceId: "fan-on" } }, "fan-off", T0), null);
});

test("グループに入っていない機器は記録も判定も変えない", () => {
  const states = { fan: { operatedAt: at(T0), deviceId: "fan-on" } };
  assert.equal(stampGroupOperation([fan], states, "lamp", at(T0 + MIN)), states);
  const split = partitionGroupLocked(
    [{ id: "a", deviceId: "lamp", on: true }, { id: "b", deviceId: "fan-off", on: true }],
    [fan],
    states,
    T0 + MIN,
  );
  assert.deepEqual(split.run.map((a) => a.id), ["a"]);
  assert.deepEqual(split.locked.map((x) => x.action.id), ["b"]);
});

test("動かした記録は覚えていた操作を捨て、時間を数え直す", () => {
  const pending = { automationId: "off", actionIds: ["off-act"], at: at(T0 + MIN) };
  const deferred = deferGroupActions(stampGroupOperation([fan], {}, "fan-on", at(T0)), new Map([["fan", pending]]));
  assert.deepEqual(deferred.fan.pending, pending);
  const again = stampGroupOperation([fan], deferred, "fan-off", at(T0 + 5 * MIN));
  assert.deepEqual(again?.fan, { operatedAt: at(T0 + 5 * MIN), deviceId: "fan-off" });
  assert.equal(deviceGroupLock([fan], again, "fan-on", T0 + 12 * MIN)?.until, T0 + 15 * MIN);
});

test("まだ動かしていないグループには操作を覚えさせない", () => {
  const pending = { automationId: "off", actionIds: ["off-act"], at: at(T0) };
  assert.deepEqual(deferGroupActions({}, new Map([["fan", pending]])), {});
});

test("無くなったグループの記録を落とす", () => {
  const states = {
    fan: { operatedAt: at(T0), deviceId: "fan-on" },
    gone: { operatedAt: at(T0), deviceId: "x" },
  };
  assert.deepEqual(pruneGroupStates([fan], states), { fan: states.fan });
  assert.deepEqual(pruneGroupStates([fan], undefined), {});
});

test("止める時間が明けるまでは送らず、明けたら条件が続く操作だけ送る", () => {
  const off = sensorAuto("off", "fan-off", true);
  const states = {
    fan: {
      operatedAt: at(T0),
      deviceId: "fan-on",
      pending: { automationId: "off", actionIds: ["off-act"], at: at(T0 + MIN) },
    },
  };
  const waiting = dueGroupPendings(home([off], states), T0 + 9 * MIN);
  assert.deepEqual(waiting, { run: [], clear: [] });
  const due = dueGroupPendings(home([off], states), T0 + 10 * MIN);
  assert.deepEqual(due.clear, ["fan"]);
  assert.deepEqual(due.run.map((x) => [x.automation.id, x.actions.map((a) => a.id)]), [["off", ["off-act"]]]);
});

test("条件が外れた操作は、明けるのを待たずに捨てる", () => {
  const states = {
    fan: {
      operatedAt: at(T0),
      deviceId: "fan-on",
      pending: { automationId: "off", actionIds: ["off-act"], at: at(T0 + MIN) },
    },
  };
  for (const automations of [
    [sensorAuto("off", "fan-off", false)],
    [{ ...sensorAuto("off", "fan-off", true), enabled: false }],
    [],
  ]) {
    assert.deepEqual(dueGroupPendings(home(automations, states), T0 + 2 * MIN), { run: [], clear: ["fan"] });
  }
  assert.deepEqual(clearGroupPendings(states, ["fan"]), { fan: { operatedAt: at(T0), deviceId: "fan-on" } });
});

test("時刻の操作は明けたら送り、機器と場面は状態が続くときだけ送る", () => {
  const pending = { automationId: "a", actionIds: ["act"], at: at(T0 + MIN) };
  const states = { fan: { operatedAt: at(T0), deviceId: "fan-on", pending } };
  const base = { id: "a", name: "a", enabled: true, actions: [{ id: "act", deviceId: "fan-off", on: true }] };
  const now = T0 + 10 * MIN;

  const time: Automation = { ...base, trigger: { type: "time", repeat: "daily", hour: 23, minute: 0 } };
  assert.equal(dueGroupPendings(home([time], states), now).run.length, 1);

  const byDevice: Automation = { ...base, trigger: { type: "device", deviceId: "lamp", deviceOn: true } };
  const lampOn = [ir("fan-on"), ir("fan-off"), plug("lamp", true)];
  const lampOff = [ir("fan-on"), ir("fan-off"), plug("lamp", false)];
  assert.equal(dueGroupPendings(home([byDevice], states, lampOn), now).run.length, 1);
  assert.deepEqual(dueGroupPendings(home([byDevice], states, lampOff), T0 + 2 * MIN), { run: [], clear: ["fan"] });

  const byScene: Automation = { ...base, trigger: { type: "scene", sceneId: "night" } };
  assert.equal(dueGroupPendings({ ...home([byScene], states), lastScene: "night" }, now).run.length, 1);
  assert.deepEqual(dueGroupPendings({ ...home([byScene], states), lastScene: "away" }, now), { run: [], clear: ["fan"] });
});

test("上で成立している打ち切りは、覚えていた下の操作も動かさない", () => {
  const stop = { ...sensorAuto("stop", "lamp", true), stopOnMatch: true };
  const off = sensorAuto("off", "fan-off", true);
  const states = {
    fan: {
      operatedAt: at(T0),
      deviceId: "fan-on",
      pending: { automationId: "off", actionIds: ["off-act"], at: at(T0 + MIN) },
    },
  };
  assert.deepEqual(dueGroupPendings(home([stop, off], states), T0 + 10 * MIN), { run: [], clear: ["fan"] });
  assert.equal(dueGroupPendings(home([off, stop], states), T0 + 10 * MIN).run.length, 1);
  const released = { ...stop, lastFiredKey: "humid:humidity:gte:60::fail" };
  assert.equal(dueGroupPendings(home([released, off], states), T0 + 10 * MIN).run.length, 1);
});

test("読み返せる機器がもう目標どおりなら、明けても送らない", () => {
  const group: DeviceGroup = { id: "fan", name: "換気扇", deviceIds: ["plug"], lockMinutes: 10 };
  const auto = sensorAuto("on", "plug", true);
  const states = {
    fan: {
      operatedAt: at(T0),
      deviceId: "plug",
      pending: { automationId: "on", actionIds: ["on-act"], at: at(T0 + MIN) },
    },
  };
  const snap = (on: boolean) => ({
    deviceGroups: [group], deviceGroupStates: states, automations: [auto], devices: [plug("plug", on)], lastScene: null,
  });
  assert.deepEqual(dueGroupPendings(snap(true), T0 + 10 * MIN), { run: [], clear: ["fan"] });
  assert.equal(dueGroupPendings(snap(false), T0 + 10 * MIN).run.length, 1);
});

test("グループから外した機器や消えた操作は送らない", () => {
  const off = sensorAuto("off", "fan-off", true);
  const pending = { automationId: "off", actionIds: ["off-act"], at: at(T0 + MIN) };
  const states = { fan: { operatedAt: at(T0), deviceId: "fan-on", pending } };
  const shrunk = { ...home([off], states), deviceGroups: [{ ...fan, deviceIds: ["fan-on"] }] };
  assert.deepEqual(dueGroupPendings(shrunk, T0 + 10 * MIN), { run: [], clear: ["fan"] });
  const edited = home([{ ...off, actions: [{ id: "new", deviceId: "fan-off", on: true }] }], states);
  assert.deepEqual(dueGroupPendings(edited, T0 + 10 * MIN), { run: [], clear: ["fan"] });
});

test("画面には明ける時刻と、覚えている操作を出す", () => {
  const off = sensorAuto("off", "fan-off", true);
  const state = { operatedAt: at(T0), deviceId: "fan-on" };
  // T0 は日本時間 09:00。
  assert.equal(groupLockNote(fan, state, [off], T0 + MIN), "09:10 までオートメーションを止めています");
  assert.equal(groupLockNote(fan, state, [off], T0 + 10 * MIN), null);
  assert.equal(groupLockNote(fan, undefined, [off], T0), null);
  const pending = { ...state, pending: { automationId: "off", actionIds: ["off-act"], at: at(T0 + MIN) } };
  assert.equal(
    groupLockNote(fan, pending, [off], T0 + MIN),
    "09:10 までオートメーションを止めています。明けたとき条件が続いていれば「off」を動かします",
  );
  assert.equal(
    groupLockNote(fan, pending, [{ ...off, enabled: false }], T0 + MIN),
    "09:10 までオートメーションを止めています",
  );
});
