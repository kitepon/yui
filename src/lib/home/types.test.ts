import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acStatusLine,
  completeTrigger,
  connectorBadge,
  migrateAutomation,
  migrateOutdoorSensorTrigger,
  sensorMetricsOf,
  sensorTempLabel,
  stripConnectorFromExtra,
  type Device,
} from "./types.ts";

test("気温の別名は extra をラベルにする", () => {
  assert.equal(sensorTempLabel({ extra: "水温" }), "水温");
  assert.equal(sensorTempLabel({ extra: "直結 · 192.168.1.16" }), "気温");
  assert.equal(sensorTempLabel(undefined), "気温");
});

test("エアコンカードは停止中でも室温・湿度・外気温を出す", () => {
  const ac: Device = {
    id: "daikin:m",
    name: "ダイキンエアコン",
    room: "リビング",
    brand: "daikin",
    kind: "ac",
    online: true,
    source: "live",
    nativeId: "h",
    connector: "daikin",
    on: false,
    mode: "cool",
    targetTemp: 26,
    temperature: 23,
    humidity: 70,
    outdoorTemp: 20.5,
  };
  assert.equal(acStatusLine(ac), "停止 · 室温23° · 70% · 外20.5°");
  assert.equal(acStatusLine({ ...ac, on: true, fanSpeed: "auto", fanSwing: "off" }), "冷房 26° · 自動 · 固定 · 室温23° · 70% · 外20.5°");
  assert.equal(acStatusLine({ ...ac, temperature: undefined, humidity: undefined, outdoorTemp: undefined }), "停止");
});

test("ダイキンの外気温はエアコンが持つ値だけ出す", () => {
  const ac: Device = {
    id: "daikin:m",
    name: "ダイキンエアコン",
    room: "リビング",
    brand: "daikin",
    kind: "ac",
    online: true,
    source: "live",
    nativeId: "h",
    connector: "daikin",
    temperature: 23,
    humidity: 55,
    outdoorTemp: 19.5,
  };
  assert.deepEqual(sensorMetricsOf(ac), ["temperature", "humidity", "outdoorTemp"]);
  assert.deepEqual(sensorMetricsOf({ ...ac, outdoorTemp: undefined }), ["temperature", "humidity"]);
});

test("独立の外気温センサー条件はエアコンの外気温へ写す", () => {
  const t = migrateOutdoorSensorTrigger({
    type: "sensor",
    deviceId: "daikin-outdoor:AABB",
    metric: "temperature",
    op: "gte",
    value: 28,
  });
  assert.equal(t.deviceId, "daikin:AABB");
  assert.equal(t.metric, "outdoorTemp");
  const auto = migrateAutomation({
    id: "a1",
    name: "暑い",
    enabled: true,
    trigger: { type: "sensor", deviceId: "daikin-outdoor:AABB", metric: "temperature", op: "gte", value: 28 },
    actions: [],
  });
  assert.equal(auto?.trigger.deviceId, "daikin:AABB");
  assert.equal(auto?.trigger.metric, "outdoorTemp");
});

test("badge is the connector, not 実機", () => {
  assert.equal(connectorBadge({ connector: "nature" }), "Nature Remo");
  assert.equal(connectorBadge({ connector: "switchbot" }), "SwitchBot");
  assert.equal(connectorBadge({ connector: "smartlife" }), "Smart Life");
  assert.equal(connectorBadge({ connector: "demo" }), "デモ");
});

test("migrateAutomation は連続では動かさないを残す", () => {
  const auto = migrateAutomation({
    id: "air",
    name: "外気取り込み優先",
    enabled: true,
    skipContinuous: true,
    trigger: { type: "sensor", deviceId: "ac", metric: "outdoorTemp", op: "between", value: 18, valueMax: 23 },
    actions: [{ id: "a", deviceId: "bot", on: true }],
  });
  assert.equal(auto?.skipContinuous, true);
  const off = migrateAutomation({
    id: "air2",
    name: "x",
    enabled: true,
    trigger: { type: "time" },
    actions: [{ id: "a", deviceId: "p", on: true }],
  });
  assert.equal(off?.skipContinuous, undefined);
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
