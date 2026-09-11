import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySwitchbotStatus,
  switchbotAcSetAll,
  switchbotBasicCommand,
  switchbotBleConfigured,
  switchbotErrorMessage,
  switchbotIrKind,
  switchbotNativeMac,
  switchbotToDevices,
  switchbotUsesBle,
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

function withBleUrl<T>(value: string | undefined, fn: () => T): T {
  const before = process.env.YUI_SWITCHBOT_BLE_URL;
  if (value === undefined) delete process.env.YUI_SWITCHBOT_BLE_URL;
  else process.env.YUI_SWITCHBOT_BLE_URL = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.YUI_SWITCHBOT_BLE_URL;
    else process.env.YUI_SWITCHBOT_BLE_URL = before;
  }
}

test("BLE 直結は MAC を正規化し、押すボットだけクラウドを使わない", () => {
  assert.equal(switchbotNativeMac("D382F7434EB5"), "D3:82:F7:43:4E:B5");
  assert.equal(switchbotNativeMac("d2:cf:74:f3:89:a2"), "D2:CF:74:F3:89:A2");
  const bot = {
    id: "switchbot:D382F7434EB5",
    name: "換気扇オン",
    room: "その他",
    brand: "switchbot" as const,
    kind: "bot" as const,
    online: true,
    source: "live" as const,
    nativeId: "D382F7434EB5",
    connector: "switchbot" as const,
    botMode: "press" as const,
  };
  withBleUrl("http://127.0.0.1:18862", () => {
    assert.equal(switchbotBleConfigured(), true);
    assert.equal(switchbotUsesBle(bot), true);
    const [listed] = switchbotToDevices([
      {
        deviceId: "D382F7434EB5",
        deviceName: "換気扇オン",
        deviceType: "Bot",
        enableCloudService: false,
        hubDeviceId: "000000000000",
      },
    ]);
    assert.equal(listed.extra, "Bot · 直結");
    assert.equal(listed.online, true);
  });
  assert.equal(switchbotUsesBle({ ...bot, kind: "plug" }), false);
});

test("ハブの無い Bot はハブなしと出し、押すモードは press を送る", () => {
  const [bot] = withBleUrl(undefined, () =>
    switchbotToDevices([
      {
        deviceId: "b",
        deviceName: "換気扇オン",
        deviceType: "Bot",
        enableCloudService: false,
        hubDeviceId: "000000000000",
      },
    ]),
  );
  assert.equal(bot.extra, "Bot · ハブなし");
  assert.equal(bot.online, false);
  const pressed = applySwitchbotStatus(bot, { power: "on", deviceMode: "pressMode" });
  assert.equal(pressed.botMode, "press");
  assert.equal(pressed.on, false);
  assert.deepEqual(switchbotBasicCommand(pressed, { on: true }), {
    command: "press",
    parameter: "default",
    commandType: "command",
  });
  assert.deepEqual(switchbotBasicCommand(pressed, { on: false }), {
    command: "press",
    parameter: "default",
    commandType: "command",
  });
  const switched = applySwitchbotStatus(bot, { power: "on", deviceMode: "switchMode" });
  assert.equal(switched.botMode, "switch");
  assert.equal(switched.on, true);
  assert.equal(switchbotBasicCommand(switched, { on: false }).command, "turnOff");
  assert.equal(switchbotErrorMessage(161, "device offline"), "機器がオフラインです。ボットはハブ経由でないとクラウドから動かせません");
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
