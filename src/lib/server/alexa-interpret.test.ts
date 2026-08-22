import assert from "node:assert/strict";
import { test } from "node:test";
import type { Device, Scene } from "@/lib/home/types";
import { interpretVoice } from "./alexa-interpret.ts";

const devices: Device[] = [
  {
    id: "nature:light",
    name: "シーリング",
    room: "リビング",
    brand: "nature",
    kind: "light",
    online: true,
    source: "live",
    nativeId: "1",
    connector: "nature",
    on: true,
  },
  {
    id: "nature:ac",
    name: "エアコン",
    room: "リビング",
    brand: "nature",
    kind: "ac",
    online: true,
    source: "live",
    nativeId: "2",
    connector: "nature",
    on: true,
  },
  {
    id: "sb:kit",
    name: "キッチン",
    room: "リビング",
    brand: "switchbot",
    kind: "bot",
    online: true,
    source: "live",
    nativeId: "3",
    connector: "switchbot",
    on: false,
  },
];

const scenes: Scene[] = [{ id: "sc-ohayo", name: "おはよう", hint: "", steps: [] }];

test("scene name is handled by 結, not Alexa", () => {
  const cmd = interpretVoice("おはよう", devices, scenes);
  assert.equal(cmd.type, "scene");
  if (cmd.type === "scene") assert.equal(cmd.sceneId, "sc-ohayo");
});

test("named device on/off", () => {
  const cmd = interpretVoice("シーリング消して", devices, scenes);
  assert.equal(cmd.type, "devices");
  if (cmd.type === "devices") {
    assert.deepEqual(cmd.patches, [{ id: "nature:light", on: false }]);
  }
});

test("room and kind without listing every phrase in Alexa", () => {
  const cmd = interpretVoice("リビングの電気を消して", devices, scenes);
  assert.equal(cmd.type, "devices");
  if (cmd.type === "devices") {
    assert.deepEqual(cmd.patches, [{ id: "nature:light", on: false }]);
  }
});
