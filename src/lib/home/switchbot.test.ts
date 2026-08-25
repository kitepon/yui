import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySwitchbotStatus,
  switchbotAcSetAll,
  switchbotIrKind,
  switchbotToDevices,
} from "./switchbot.ts";
import type { Device } from "./types.ts";

test("物理機器の deviceType を結の kind へ写す", () => {
  const devices = switchbotToDevices([
    { deviceId: "b", deviceName: "ボット", deviceType: "Bot" },
    { deviceId: "v", deviceName: "掃除", deviceType: "Robot Vacuum Cleaner S1" },
    { deviceId: "m", deviceName: "メーター", deviceType: "Meter" },
  ]);
  assert.equal(devices[0].kind, "bot");
  assert.equal(devices[1].kind, "other");
  assert.equal(devices[2].kind, "sensor");
});

test("IR は名前でなく deviceType でエアコンを見分ける", () => {
  assert.equal(switchbotIrKind("Air Conditioner", "リビング"), "ac");
  assert.equal(switchbotIrKind("TV", "テレビ"), "ir");
  assert.equal(switchbotIrKind("IR", "寝室エアコン"), "ac");
});

test("Meter の status は気温と湿度を載せる", () => {
  const [meter] = switchbotToDevices([{ deviceId: "m", deviceName: "リビング", deviceType: "Meter" }]);
  const next = applySwitchbotStatus(meter, { temperature: 25.5, humidity: 48, battery: 90 });
  assert.equal(next.temperature, 25.5);
  assert.equal(next.humidity, 48);
});

test("IR エアコンの SET_ALL は HA と同じ 温度,モード,風量,電源", () => {
  const device: Device = {
    id: "switchbot-ir:ac",
    name: "リビング",
    room: "リビング",
    brand: "switchbot",
    kind: "ac",
    online: true,
    source: "live",
    nativeId: "ac",
    connector: "switchbot",
    on: false,
    targetTemp: 26,
    mode: "cool",
    fanSpeed: "auto",
  };
  assert.deepEqual(switchbotAcSetAll(device, { on: true, targetTemp: 24, mode: "heat", fanSpeed: "5" }), {
    command: "setAll",
    parameter: "24,5,4,on",
    commandType: "command",
  });
  assert.equal(switchbotAcSetAll(device, { on: false }).parameter, "26,2,1,off");
});
