import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOUR_MS,
  MINUTE_MS,
  clampWindow,
  collectValues,
  minSpanSteps,
  paddedDomain,
  yScale,
} from "./analysis-view.ts";

test("1時間未満には縮めず、区間の中に収める", () => {
  const from = Date.parse("2026-09-12T00:00:00.000Z");
  const to = from + 24 * HOUR_MS;
  const [a, b] = clampWindow(from, to, from + 10 * HOUR_MS, from + 10.2 * HOUR_MS, HOUR_MS);
  assert.equal(b - a, HOUR_MS);
  assert.ok(a >= from && b <= to);
});

test("区間そのものが1時間未満なら、全部を出す", () => {
  const from = 1000;
  const to = from + 10 * MINUTE_MS;
  assert.deepEqual(clampWindow(from, to, from, to, HOUR_MS), [from, to]);
});

test("はみ出した窓は幅を保ったまま区間内へ戻す", () => {
  const from = 0;
  const to = 10;
  assert.deepEqual(clampWindow(from, to, -4, 2, 4), [0, 6]);
  assert.deepEqual(clampWindow(from, to, 8, 14, 4), [4, 10]);
});

test("同じ値だけなら上下に余白を足す", () => {
  const [lo, hi] = paddedDomain([24]);
  assert.ok(lo < 24 && hi > 24);
});

test("系列の数値だけを集める", () => {
  assert.deepEqual(
    collectValues(
      [
        { t: 1, a: 20, b: 1 },
        { t: 2, a: 21 },
      ],
      ["a"],
    ),
    [20, 21],
  );
});

test("1分刻みなら1時間は60ステップ", () => {
  assert.equal(minSpanSteps(24 * HOUR_MS, MINUTE_MS, HOUR_MS), 60);
});

test("温度の最小幅は0.5度", () => {
  assert.equal(yScale("celsius").minSpan, 0.5);
  assert.equal(yScale("percent").minSpan, 2);
});
