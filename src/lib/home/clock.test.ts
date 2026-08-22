import assert from "node:assert/strict";
import { test } from "node:test";
import { clockInTokyo, isLightPeriod, nextPeriodPreview, periodOfHour } from "./clock.ts";

test("UTC afternoon is the same calendar day in JST", () => {
  const c = clockInTokyo(new Date("2026-08-16T08:00:00.000Z"));
  assert.equal(c.hour, 17);
  assert.equal(c.minute, 0);
  assert.equal(c.dayKey, "2026-08-16");
  assert.equal(c.weekday, 0);
  assert.equal(c.label, "17:00");
  assert.equal(c.period, "evening");
  assert.equal(c.periodLabel, "夕方");
});

test("JST hour maps to six named periods", () => {
  assert.equal(periodOfHour(0), "late");
  assert.equal(periodOfHour(4), "late");
  assert.equal(periodOfHour(5), "dawn");
  assert.equal(periodOfHour(6), "dawn");
  assert.equal(periodOfHour(7), "morning");
  assert.equal(periodOfHour(10), "morning");
  assert.equal(periodOfHour(11), "day");
  assert.equal(periodOfHour(16), "day");
  assert.equal(periodOfHour(17), "evening");
  assert.equal(periodOfHour(18), "evening");
  assert.equal(periodOfHour(19), "night");
  assert.equal(periodOfHour(23), "night");
});

test("dawn morning and day are the light faces", () => {
  assert.equal(isLightPeriod("late"), false);
  assert.equal(isLightPeriod("dawn"), true);
  assert.equal(isLightPeriod("morning"), true);
  assert.equal(isLightPeriod("day"), true);
  assert.equal(isLightPeriod("evening"), true);
  assert.equal(isLightPeriod("night"), false);
});

test("preview walks six periods and returns to live", () => {
  assert.equal(nextPeriodPreview("evening", "evening"), "night");
  assert.equal(nextPeriodPreview("night", "evening"), "late");
  assert.equal(nextPeriodPreview("day", "evening"), null);
});

test("UTC 15:00 is next calendar day 00:00 JST", () => {
  const c = clockInTokyo(new Date("2026-08-16T15:00:00.000Z"));
  assert.equal(c.hour, 0);
  assert.equal(c.minute, 0);
  assert.equal(c.dayKey, "2026-08-17");
  assert.equal(c.weekday, 1);
  assert.equal(c.label, "00:00");
});
