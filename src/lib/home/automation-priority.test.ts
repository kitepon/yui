import assert from "node:assert/strict";
import { test } from "node:test";
import { prioritizeAutomationActions, sensorCondition, skipContinuousActions } from "./automation-priority.ts";
import type { AutoAction, Automation } from "./types.ts";

function auto(id: string, deviceIds: string[]): Automation {
  const actions: AutoAction[] = deviceIds.map((deviceId, i) => ({ id: `${id}-${i}`, deviceId, on: true }));
  return {
    id,
    name: id,
    enabled: true,
    trigger: { type: "sensor" },
    actions,
  };
}

test("上のオートメーションが取った機器は、下が送らない", () => {
  const a = auto("1", ["A", "B"]);
  const b = auto("2", ["B", "C"]);
  const planned = prioritizeAutomationActions([a, b]);
  assert.deepEqual(
    planned.get("1")?.map((x) => x.deviceId),
    ["A", "B"],
  );
  assert.deepEqual(
    planned.get("2")?.map((x) => x.deviceId),
    ["C"],
  );
});

test("欄の並びが優先で、下に書いただけでは上を奪えない", () => {
  const a = auto("1", ["A", "B"]);
  const b = auto("2", ["B", "C"]);
  const planned = prioritizeAutomationActions([b, a]);
  assert.deepEqual(
    planned.get("2")?.map((x) => x.deviceId),
    ["B", "C"],
  );
  assert.deepEqual(
    planned.get("1")?.map((x) => x.deviceId),
    ["A"],
  );
});

test("機器 id の無いアクションは対象にしない", () => {
  const a: Automation = {
    id: "1",
    name: "1",
    enabled: true,
    trigger: { type: "time" },
    actions: [
      { id: "x", on: true },
      { id: "y", deviceId: "A", on: true },
    ],
  };
  const planned = prioritizeAutomationActions([a]);
  assert.deepEqual(
    planned.get("1")?.map((x) => x.deviceId),
    ["A"],
  );
});

test("以上・以下は一度送ったあとも、条件を満たしているあいだは機器を取る", () => {
  const upper: Automation = {
    id: "outdoor",
    name: "外気取り込み優先",
    enabled: true,
    trigger: {
      type: "sensor",
      deviceId: "daikin:1",
      metric: "outdoorTemp",
      op: "lte",
      value: 24,
    },
    lastFiredKey: "daikin:1:outdoorTemp:lte:24::pass",
    actions: [{ id: "x", deviceId: "daikin:1", on: false }],
  };
  const d = sensorCondition(upper, {
    devices: [{ id: "daikin:1", outdoorTemp: 22 }],
    climate: {},
  });
  assert.equal(d.match, true);
  assert.equal(d.holds, true);
  const lower: Automation = {
    id: "tank",
    name: "水温",
    enabled: true,
    trigger: { type: "sensor", deviceId: "water", metric: "temperature", op: "between", value: 25, valueMax: 25.5 },
    actions: [{ id: "y", deviceId: "daikin:1", on: true }],
  };
  const planned = prioritizeAutomationActions([upper, lower]);
  assert.deepEqual(planned.get("outdoor")?.map((x) => x.deviceId), ["daikin:1"]);
  assert.deepEqual(planned.get("tank")?.map((x) => x.deviceId), []);
});

test("範囲に入った最初は送り、入っているあいだは保持する", () => {
  const auto: Automation = {
    id: "air",
    name: "外気取り込み優先",
    enabled: true,
    trigger: {
      type: "sensor",
      deviceId: "daikin:1",
      metric: "outdoorTemp",
      op: "between",
      value: 18,
      valueMax: 23,
    },
    actions: [{ id: "x", deviceId: "bot:1", on: true }],
  };
  const snap = { devices: [{ id: "daikin:1", outdoorTemp: 20 }], climate: {} };
  const enter = sensorCondition(auto, snap);
  assert.equal(enter.match, true);
  assert.equal(enter.holds, false);
  assert.equal(enter.key?.endsWith(":pass"), true);
  const stay = sensorCondition({ ...auto, lastFiredKey: enter.key }, snap);
  assert.equal(stay.match, true);
  assert.equal(stay.holds, true);
  const leave = sensorCondition({ ...auto, lastFiredKey: enter.key }, {
    devices: [{ id: "daikin:1", outdoorTemp: 28 }],
    climate: {},
  });
  assert.equal(leave.match, false);
  assert.equal(leave.holds, false);
  assert.equal(leave.key?.endsWith(":fail"), true);
  const reenter = sensorCondition({ ...auto, lastFiredKey: leave.key }, snap);
  assert.equal(reenter.match, true);
  assert.equal(reenter.holds, false);
});

test("連続では動かさないは、同じ条件が続いているときだけ操作を止める", () => {
  const auto: Automation = {
    id: "air",
    name: "外気取り込み優先",
    enabled: true,
    skipContinuous: true,
    trigger: { type: "sensor" },
    actions: [{ id: "x", deviceId: "bot:1", on: true }],
  };
  assert.equal(skipContinuousActions(auto, true), true);
  assert.equal(skipContinuousActions(auto, false), false);
  assert.equal(skipContinuousActions({ ...auto, skipContinuous: undefined }, true), false);
});
