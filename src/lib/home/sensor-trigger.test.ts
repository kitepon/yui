import assert from "node:assert/strict";
import { test } from "node:test";
import { metricValue, sensorPassKey, sensorTriggerDecision } from "./sensor-trigger.ts";
import type { AutoTrigger } from "./types.ts";

const below: AutoTrigger = {
  type: "sensor",
  deviceId: "s1",
  metric: "temperature",
  op: "lte",
  value: 26,
};

test("外気温は outdoorTemp を読む", () => {
  assert.equal(metricValue({ temperature: 23, outdoorTemp: 19.5 }, "outdoorTemp"), 19.5);
  assert.equal(metricValue({ temperature: 23, outdoorTemp: 19.5 }, "temperature"), 23);
  assert.equal(metricValue({ temperature: 23 }, "outdoorTemp"), undefined);
});

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

const band: AutoTrigger = {
  type: "sensor",
  deviceId: "water",
  metric: "temperature",
  op: "between",
  value: 24,
  valueMax: 26.5,
};

test("範囲内なら pass、外なら fail", () => {
  assert.equal(sensorTriggerDecision(23.9, band).pass, false);
  assert.equal(sensorTriggerDecision(24, band).pass, true);
  assert.equal(sensorTriggerDecision(25.2, band).pass, true);
  assert.equal(sensorTriggerDecision(26.5, band).pass, false);
  assert.equal(sensorTriggerDecision(26.4, band).pass, true);
  assert.equal(sensorTriggerDecision(26.6, band).pass, false);
});

test("隣り合う範囲は上限の値で重ならない", () => {
  const mid: AutoTrigger = { ...band, value: 25, valueMax: 25.5 };
  const hot: AutoTrigger = { ...band, value: 25.5, valueMax: 26 };
  assert.equal(sensorTriggerDecision(25.5, mid).pass, false);
  assert.equal(sensorTriggerDecision(25.5, hot).pass, true);
});

test("下限と上限が逆でも範囲として扱う", () => {
  assert.equal(sensorTriggerDecision(25, { ...band, value: 26.5, valueMax: 24 }).pass, true);
});

test("戻り幅が無ければ、成立中でも境目は動かず、キーも従来と同じ", () => {
  assert.equal(sensorTriggerDecision(26.1, below, true).pass, false);
  assert.equal(sensorTriggerDecision(26, below).key, "s1:temperature:lte:26::pass");
  assert.equal(sensorTriggerDecision(26, { ...below, hysteresis: 0 }).key, "s1:temperature:lte:26::pass");
  assert.equal(sensorPassKey(below), "s1:temperature:lte:26::pass");
});

test("以上の戻り幅：成立するまでは元のしきい値、成立中は しきい値−戻り幅 を下回るまで続く", () => {
  const hot: AutoTrigger = { type: "sensor", deviceId: "w", metric: "temperature", op: "gte", value: 25.5, hysteresis: 0.2 };
  assert.equal(sensorTriggerDecision(25.4, hot).pass, false);
  assert.equal(sensorTriggerDecision(25.5, hot).pass, true);
  assert.equal(sensorTriggerDecision(25.4, hot, true).pass, true);
  // 25.5 - 0.2 は浮動小数で 25.3 にならない。境目ちょうどを取りこぼさない。
  assert.equal(sensorTriggerDecision(25.3, hot, true).pass, true);
  assert.equal(sensorTriggerDecision(25.2, hot, true).pass, false);
});

test("以下の戻り幅：成立中は しきい値+戻り幅 を上回るまで続く", () => {
  const cool: AutoTrigger = { ...below, value: 21.5, hysteresis: 0.5 };
  assert.equal(sensorTriggerDecision(21.6, cool).pass, false);
  assert.equal(sensorTriggerDecision(21.5, cool).pass, true);
  assert.equal(sensorTriggerDecision(22, cool, true).pass, true);
  assert.equal(sensorTriggerDecision(22.1, cool, true).pass, false);
});

test("範囲の戻り幅：成立中は両端を戻り幅のぶん広げ、上限は含めない", () => {
  const hot: AutoTrigger = { ...band, value: 25.6, valueMax: 26, hysteresis: 0.2 };
  assert.equal(sensorTriggerDecision(25.5, hot).pass, false);
  assert.equal(sensorTriggerDecision(26, hot).pass, false);
  assert.equal(sensorTriggerDecision(25.4, hot, true).pass, true);
  assert.equal(sensorTriggerDecision(25.3, hot, true).pass, false);
  assert.equal(sensorTriggerDecision(26.1, hot, true).pass, true);
  assert.equal(sensorTriggerDecision(26.2, hot, true).pass, false);
});

test("戻り幅はキーに入る。変えたら古い pass では黙らず、末尾は pass / fail のまま", () => {
  const plain = sensorTriggerDecision(25, below);
  const wide = sensorTriggerDecision(25, { ...below, hysteresis: 0.2 });
  assert.notEqual(plain.key, wide.key);
  assert.equal(wide.key, "s1:temperature:lte:26::h0.2:pass");
  assert.equal(sensorTriggerDecision(27, { ...below, hysteresis: 0.2 }).key.endsWith(":fail"), true);
  assert.notEqual(wide.key, sensorTriggerDecision(25, { ...below, hysteresis: 0.3 }).key);
});
