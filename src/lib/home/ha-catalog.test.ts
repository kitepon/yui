import assert from "node:assert/strict";
import { test } from "node:test";
import { switchbotKindFromType, tuyaKindFromCategory } from "./ha-catalog.ts";

test("Tuya の代表 category は HA の表どおり", () => {
  assert.equal(tuyaKindFromCategory("dj"), "light");
  assert.equal(tuyaKindFromCategory("cz"), "plug");
  assert.equal(tuyaKindFromCategory("cl"), "curtain");
  assert.equal(tuyaKindFromCategory("kt"), "ac");
  assert.equal(tuyaKindFromCategory("wsdcg"), "sensor");
  assert.equal(tuyaKindFromCategory("pir"), "sensor");
  assert.equal(tuyaKindFromCategory(""), "other");
  assert.equal(tuyaKindFromCategory("no-such"), "other");
});

test("SwitchBot は Robot Vacuum を Bot にしない", () => {
  assert.equal(switchbotKindFromType("Bot"), "bot");
  assert.equal(switchbotKindFromType("Robot Vacuum Cleaner S1"), "other");
  assert.equal(switchbotKindFromType("Color Bulb"), "light");
  assert.equal(switchbotKindFromType("Meter"), "sensor");
  assert.equal(switchbotKindFromType("Hub 2"), "sensor");
  assert.equal(switchbotKindFromType("Plug Mini (JP)"), "plug");
  assert.equal(switchbotKindFromType("Air Conditioner", true), "ac");
  assert.equal(switchbotKindFromType("TV", true), "ir");
  assert.equal(switchbotKindFromType("Light", true), "light");
});
