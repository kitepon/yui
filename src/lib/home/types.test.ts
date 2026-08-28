import assert from "node:assert/strict";
import { test } from "node:test";
import { completeTrigger, connectorBadge, stripConnectorFromExtra, migrateAutomation } from "./types.ts";

test("badge is the connector, not 実機", () => {
  assert.equal(connectorBadge({ connector: "nature" }), "Nature Remo");
  assert.equal(connectorBadge({ connector: "switchbot" }), "SwitchBot");
  assert.equal(connectorBadge({ connector: "smartlife" }), "Smart Life");
  assert.equal(connectorBadge({ connector: "demo" }), "デモ");
});

test("時刻トリガーは触っていない項目も 7:00 毎日として保存する", () => {
  assert.deepEqual(completeTrigger({ type: "time" }), {
    type: "time",
    repeat: "daily",
    hour: 7,
    minute: 0,
  });
});

test("センサーの条件と閾値は画面の初期値を残す", () => {
  const t = completeTrigger({ type: "sensor", deviceId: "s1" });
  assert.equal(t.metric, "temperature");
  assert.equal(t.op, "gte");
  assert.equal(t.value, 28);
});

test("migrateAutomation は欠けた時刻を 7:00 にする", () => {
  const auto = migrateAutomation({
    id: "a0",
    name: "朝",
    enabled: true,
    trigger: { type: "time" },
    actions: [{ id: "act1", deviceId: "ac-1", on: true }],
  });
  assert.equal(auto?.trigger.hour, 7);
  assert.equal(auto?.trigger.minute, 0);
  assert.equal(auto?.trigger.repeat, "daily");
});

test("detail extra drops the connector already shown on the badge", () => {
  assert.equal(
    stripConnectorFromExtra("Nature Remo · リビングのRemo · AC", "nature"),
    "リビングのRemo · AC",
  );
  assert.equal(stripConnectorFromExtra("Nature Remo", "nature"), "");
  assert.equal(stripConnectorFromExtra("Bot", "switchbot"), "Bot");
  assert.equal(stripConnectorFromExtra("cz", "smartlife"), "cz");
});
