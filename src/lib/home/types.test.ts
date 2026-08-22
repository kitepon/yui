import assert from "node:assert/strict";
import { test } from "node:test";
import { connectorBadge, stripConnectorFromExtra } from "./types.ts";

test("badge is the connector, not 実機", () => {
  assert.equal(connectorBadge({ connector: "nature" }), "Nature Remo");
  assert.equal(connectorBadge({ connector: "switchbot" }), "SwitchBot");
  assert.equal(connectorBadge({ connector: "smartlife" }), "Smart Life");
  assert.equal(connectorBadge({ connector: "demo" }), "デモ");
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
