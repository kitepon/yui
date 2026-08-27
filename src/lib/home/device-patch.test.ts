import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acModesOf,
  applyDevicePatch,
  canSetFanSpeed,
  canSetFanSwing,
  canSetTargetHumidity,
  patchAlreadyApplied,
  patchFromAction,
  reportsActuatorState,
} from "./device-patch.ts";
import { migrateAutomation, type Device } from "./types.ts";

function ac(over: Partial<Device> = {}): Device {
  return {
    id: "ac-1",
    name: "エアコン",
    room: "リビング",
    brand: "daikin",
    kind: "ac",
    online: true,
    source: "live",
    nativeId: "192.168.1.16",
    connector: "daikin",
    on: true,
    mode: "cool",
    targetTemp: 24,
    fanSpeed: "auto",
    fanSwing: "off",
    acModes: { cool: ["17", "18"], heat: ["16", "17"], dry: [], fan: [], auto: [], humidify: [] },
    ...over,
  };
}

test("ダイキンは冷房で風量・風向を出せ、除湿では風量を出さない", () => {
  assert.equal(canSetFanSpeed(ac()), true);
  assert.equal(canSetFanSwing(ac()), true);
  assert.equal(canSetFanSpeed(ac({ mode: "dry", fanSpeed: undefined })), false);
  assert.equal(canSetFanSwing(ac({ mode: "dry", fanSwing: undefined })), true);
  assert.equal(canSetTargetHumidity(ac({ mode: "dry", targetHumidity: undefined })), true);
  assert.equal(canSetFanSwing(ac({ mode: "humidify" })), false);
});

test("他社のエアコンは、値が載った項目だけ出す", () => {
  const remo = ac({ connector: "nature", brand: "nature", fanSpeed: undefined, fanSwing: undefined });
  assert.equal(canSetFanSpeed(remo), false);
  assert.equal(canSetFanSwing(remo), false);
  assert.equal(canSetFanSpeed({ ...remo, fanSpeed: "3" }), true);
});

test("加湿は能力表にある機種だけモードに出る", () => {
  assert.deepEqual(
    acModesOf(ac({ acModes: { cool: ["24"], heat: ["22"], dry: [], fan: [], auto: [] } })),
    ["cool", "heat", "dry", "fan", "auto"],
  );
  assert.ok(acModesOf(ac()).includes("humidify"));
});

test("操作の合成は、その運転では送れない項目を落とす", () => {
  const next = applyDevicePatch(
    { on: true, mode: "cool", fanSpeed: "quiet", targetTemp: 24 },
    ac(),
    { mode: "dry" },
  );
  assert.equal(next.fanSpeed, undefined);
  assert.equal(next.targetTemp, undefined);
  assert.equal(next.mode, "dry");
});

test("patchFromAction は載っている項目だけを残す", () => {
  assert.deepEqual(patchFromAction({ on: true, fanSpeed: "3" }), { on: true, fanSpeed: "3" });
  assert.deepEqual(patchFromAction({}), {});
});

test("ダイキンと Smart Life は設定を読み返せ、SwitchBot IR と学習リモコンは読めない", () => {
  assert.equal(reportsActuatorState(ac()), true);
  assert.equal(
    reportsActuatorState(ac({ connector: "smartlife", brand: "smartlife", id: "tuya:1", nativeId: "1" })),
    true,
  );
  assert.equal(
    reportsActuatorState(
      ac({
        id: "switchbot-ir:ac",
        connector: "switchbot",
        brand: "switchbot",
        nativeId: "ir",
        targetTemp: 26,
      }),
    ),
    false,
  );
  assert.equal(
    reportsActuatorState(ac({ kind: "ir", connector: "nature", brand: "nature", id: "remo:ir" })),
    false,
  );
});

test("設定が同じなら送らず、違う項目が1つでもあれば送る", () => {
  const d = ac({ on: true, mode: "cool", targetTemp: 26, fanSpeed: "auto" });
  assert.equal(patchAlreadyApplied(d, { on: true, mode: "cool", targetTemp: 26 }), true);
  assert.equal(patchAlreadyApplied(d, { on: true, mode: "cool", targetTemp: 24 }), false);
  assert.equal(patchAlreadyApplied(d, { on: false }), false);
  assert.equal(patchAlreadyApplied(d, {}), true);
});

test("migrateAutomation は範囲の上限を落とさない", () => {
  const auto = migrateAutomation({
    id: "a2",
    name: "水温",
    enabled: true,
    trigger: {
      type: "sensor",
      deviceId: "water",
      metric: "temperature",
      op: "between",
      value: 24,
      valueMax: 26.5,
    },
    actions: [{ id: "act1", deviceId: "ac-1", on: true, targetTemp: 26 }],
  });
  assert.equal(auto?.trigger.op, "between");
  assert.equal(auto?.trigger.value, 24);
  assert.equal(auto?.trigger.valueMax, 26.5);
});

test("migrateAutomation は風量・風向・湿度を落とさない", () => {
  const auto = migrateAutomation({
    id: "a1",
    name: "涼しい",
    enabled: true,
    trigger: { type: "time", repeat: "daily", hour: 7, minute: 0 },
    actions: [
      {
        id: "act1",
        deviceId: "ac-1",
        on: true,
        mode: "cool",
        fanSpeed: "quiet",
        fanSwing: "vertical",
        targetHumidity: 50,
      },
    ],
  });
  assert.equal(auto?.actions[0]?.fanSpeed, "quiet");
  assert.equal(auto?.actions[0]?.fanSwing, "vertical");
  assert.equal(auto?.actions[0]?.targetHumidity, 50);
});
