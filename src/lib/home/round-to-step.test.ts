import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDecimalInput, roundToStep } from "./round-to-step.ts";

test("時刻などは整数に揃える", () => {
  assert.equal(roundToStep(7.4, 1), 7);
  assert.equal(roundToStep(7.5, 1), 8);
});

test("センサーしきい値は小数点第一位に揃える", () => {
  assert.equal(roundToStep(28.4, 0.1), 28.4);
  assert.equal(roundToStep(28.45, 0.1), 28.5);
  assert.equal(roundToStep(28.44, 0.1), 28.4);
  assert.equal(roundToStep(0.1, 0.1), 0.1);
  assert.equal(roundToStep(28, 0.1), 28);
});

test("入力は小数点とカンマを数として読む", () => {
  assert.equal(parseDecimalInput("28.5"), 28.5);
  assert.equal(parseDecimalInput("28,5"), 28.5);
  assert.equal(parseDecimalInput("28."), null);
  assert.equal(parseDecimalInput(""), null);
});
