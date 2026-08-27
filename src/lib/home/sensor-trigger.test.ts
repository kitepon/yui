import assert from "node:assert/strict";
import { test } from "node:test";
import { sensorTriggerDecision } from "./sensor-trigger.ts";
import type { AutoTrigger } from "./types.ts";

const below: AutoTrigger = {
  type: "sensor",
  deviceId: "s1",
  metric: "temperature",
  op: "lte",
  value: 26,
};

test("室温がしきい値を下回ると pass になり、上回っている間は fail", () => {
  assert.equal(sensorTriggerDecision(26.1, below).pass, false);
  assert.equal(sensorTriggerDecision(26, below).pass, true);
  assert.equal(sensorTriggerDecision(25.5, below).pass, true);
});

test("同じ条件のままではキーが変わらず、再発火しない", () => {
  const a = sensorTriggerDecision(25.5, below);
  const b = sensorTriggerDecision(24.9, below);
  assert.equal(a.pass, true);
  assert.equal(a.key, b.key);
});

test("上から下へ抜けるとキーが fail から pass へ変わり、発火する", () => {
  const high = sensorTriggerDecision(27, below);
  const low = sensorTriggerDecision(25.5, below);
  assert.equal(high.pass, false);
  assert.equal(low.pass, true);
  assert.notEqual(high.key, low.key);
});

test("しきい値を変えたらキーが変わり、古い pass では黙らない", () => {
  const a = sensorTriggerDecision(25, below);
  const b = sensorTriggerDecision(25, { ...below, value: 24 });
  assert.notEqual(a.key, b.key);
});

test("古い pass / fail キーとは一致しない", () => {
  const now = sensorTriggerDecision(25, below);
  assert.notEqual(now.key, "pass");
  assert.notEqual(now.key, "fail");
});
