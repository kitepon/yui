import assert from "node:assert/strict";
import { test } from "node:test";
import { collectMatchingAutomations, prioritizeAutomationActions, sensorCondition, skipContinuousActions } from "./automation-priority.ts";
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

test("打ち切りの行より下は、別の機器でも条件を判定しない", () => {
  const before = auto("先行", ["照明"]);
  const stop = { ...auto("打ち切り", ["エアコン"]), stopOnMatch: true };
  const lower = auto("下", ["換気扇"]);
  const checked: string[] = [];
  const firing = collectMatchingAutomations([before, stop, lower], (a) => {
    checked.push(a.id);
    return true;
  });
  assert.deepEqual(checked, ["先行", "打ち切り"]);
  assert.deepEqual(firing, [before, stop]);
});

test("打ち切りを設定しなければ、成立した全件を従来通り集める", () => {
  const upper = auto("上", ["エアコン"]);
  const lower = auto("下", ["換気扇"]);
  assert.deepEqual(collectMatchingAutomations([upper, lower], () => true), [upper, lower]);
  assert.deepEqual(
    collectMatchingAutomations([{ ...upper, stopOnMatch: false }, lower], () => true).map((a) => a.id),
    ["上", "下"],
  );
});

test("無効・アクションなし・条件不成立の打ち切り設定は、下の判定を止めない", () => {
  const disabled = { ...auto("無効", ["A"]), enabled: false, stopOnMatch: true };
  const empty = { ...auto("空", []), stopOnMatch: true };
  const unmatched = { ...auto("不成立", ["B"]), stopOnMatch: true };
  const lower = auto("下", ["C"]);
  const checked: string[] = [];
  const firing = collectMatchingAutomations([disabled, empty, unmatched, lower], (a) => {
    checked.push(a.id);
    return a.id === "下";
  });
  assert.deepEqual(checked, ["不成立", "下"]);
  assert.deepEqual(firing, [lower]);
});

test("条件成立が続く間は、連続実行を省く回も下へ切り替わらない", () => {
  const upper: Automation = {
    ...auto("外気", ["エアコン"]),
    skipContinuous: true,
    stopOnMatch: true,
    trigger: { type: "sensor", deviceId: "外気温", metric: "temperature", op: "lte", value: 24 },
  };
  const lower: Automation = {
    ...auto("水温", ["エアコン", "換気扇"]),
    skipContinuous: true,
    trigger: { type: "sensor", deviceId: "水温計", metric: "temperature", op: "between", value: 25, valueMax: 26 },
  };
  const snap = { devices: [{ id: "外気温", temperature: 22 }, { id: "水温計", temperature: 25.5 }], climate: {} };
  let lastRan: string | undefined;
  const sent: string[] = [];
  for (let tick = 0; tick < 4; tick += 1) {
    const checked: string[] = [];
    const firing = collectMatchingAutomations([upper, lower], (a) => {
      checked.push(a.id);
      const decision = sensorCondition(a, snap);
      if (decision.key) a.lastFiredKey = decision.key;
      return decision.match;
    });
    assert.deepEqual(checked, ["外気"]);
    assert.equal(lower.lastFiredKey, undefined);
    const runnable = firing.filter((a) => !skipContinuousActions(a, lastRan));
    for (const a of runnable) {
      sent.push(a.id);
      lastRan = a.id;
    }
  }
  assert.deepEqual(sent, ["外気"]);
  snap.devices[0].temperature = 28;
  const resumed = collectMatchingAutomations([upper, lower], (a) => sensorCondition(a, snap).match);
  assert.deepEqual(resumed.map((a) => a.id), ["水温"]);
});

test("同じ設定を保持して再送しない回も、打ち切り条件は成立する", () => {
  const upper: Automation = {
    ...auto("保持", ["A"]),
    stopOnMatch: true,
    trigger: { type: "sensor", deviceId: "s", metric: "temperature", op: "between", value: 18, valueMax: 23 },
  };
  const snap = { devices: [{ id: "s", temperature: 20 }], climate: {} };
  upper.lastFiredKey = sensorCondition(upper, snap).key;
  assert.equal(sensorCondition(upper, snap).holds, true);
  const firing = collectMatchingAutomations([upper, auto("下", ["B"])], (a) => {
    assert.equal(a.id, "保持");
    return sensorCondition(a, snap).match;
  });
  assert.deepEqual(firing, [upper]);
});

test("打ち切りは並べ替え後の位置で適用する", () => {
  const stop = { ...auto("打ち切り", ["A"]), stopOnMatch: true };
  const other = auto("別", ["B"]);
  assert.deepEqual(collectMatchingAutomations([stop, other], () => true), [stop]);
  assert.deepEqual(collectMatchingAutomations([other, stop], () => true), [other, stop]);
});

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

test("連続実行を省いても条件成立中のオートメーションは機器を取る", () => {
  const hot: Automation = {
    id: "hot",
    name: "水槽水温高温域",
    enabled: true,
    skipContinuous: true,
    trigger: { type: "sensor" },
    actions: [
      { id: "a", deviceId: "ac" },
      { id: "b", deviceId: "fan-off" },
    ],
  };
  const mid: Automation = {
    id: "mid",
    name: "水槽水温中温域",
    enabled: true,
    skipContinuous: true,
    trigger: { type: "sensor" },
    actions: [
      { id: "c", deviceId: "ac" },
      { id: "d", deviceId: "fan-off" },
    ],
  };
  assert.equal(skipContinuousActions(hot, "hot"), true);
  const planned = prioritizeAutomationActions([hot, mid]);
  assert.deepEqual(planned.get("hot")?.map((x) => x.deviceId), ["ac", "fan-off"]);
  assert.deepEqual(planned.get("mid"), []);
});

test("連続では動かさないは、直前に動いたのが自分自身のときだけ止める", () => {
  const auto: Automation = {
    id: "air",
    name: "外気取り込み優先",
    enabled: true,
    skipContinuous: true,
    trigger: { type: "sensor" },
    actions: [{ id: "x", deviceId: "bot-on", on: true }],
  };
  assert.equal(skipContinuousActions(auto, "air"), true);
  assert.equal(skipContinuousActions(auto, "tank"), false);
  assert.equal(skipContinuousActions(auto, undefined), false);
  assert.equal(skipContinuousActions({ ...auto, skipContinuous: undefined }, "air"), false);
});
