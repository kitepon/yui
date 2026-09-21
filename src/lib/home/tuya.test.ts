import { test } from "node:test";
import assert from "node:assert/strict";
import { mapTuyaDevices, readingsFromTuyaStatus, tuyaCommandsFromPatch, applyTuyaStatus, collectLocalKeys, dpMapFromSpecification } from "./tuya.ts";
import type { Device } from "./types.ts";

test("Tuya の temp_current は十分の一度", () => {
  const reading = readingsFromTuyaStatus([{ code: "temp_current", value: 256 }]);
  assert.equal(reading.temperature, 25.6);
});

test("実機の水温計は va_temperature を十分の一度で読む", () => {
  const [d] = mapTuyaDevices([
    {
      id: "probe",
      name: "水温計",
      category: "wsdcg",
      online: true,
      status: [
        { code: "va_temperature", value: 265 },
        { code: "temp_unit_convert", value: "c" },
        { code: "maxtemp_set", value: 1200 },
      ],
    },
  ]);
  assert.equal(d.kind, "sensor");
  assert.equal(d.temperature, 26.5);
  assert.equal(d.extra, "水温");
});

test("既に温度がある水温計でも status の新しい値で上書きする", () => {
  const [d] = mapTuyaDevices([
    {
      id: "probe",
      name: "水温計",
      category: "wsdcg",
      status: [{ code: "va_temperature", value: 265 }],
    },
  ]);
  assert.equal(d.temperature, 26.5);
  applyTuyaStatus(d, [{ code: "va_temperature", value: 261 }]);
  assert.equal(d.temperature, 26.1);
});

test("100 未満の温度はそのまま", () => {
  const reading = readingsFromTuyaStatus([{ code: "temp_current", value: 26 }]);
  assert.equal(reading.temperature, 26);
});

test("水温計 swtz はセンサーになり、十分の一度を水温として持つ", () => {
  const [d] = mapTuyaDevices([
    {
      id: "abc",
      name: "池の水温",
      category: "swtz",
      online: true,
      status: [{ code: "temp_current", value: 241 }],
    },
  ]);
  assert.equal(d.kind, "sensor");
  assert.equal(d.temperature, 24.1);
  assert.equal(d.extra, "水温");
  assert.equal(d.id, "smartlife:abc");
});

test("水質計 szjcy も水温センサーにする", () => {
  const [d] = mapTuyaDevices([
    {
      id: "wq",
      name: "YK-S03",
      category: "szjcy",
      status: [
        { code: "tds_in", value: 120 },
        { code: "temp_current", value: 341 },
      ],
    },
  ]);
  assert.equal(d.kind, "sensor");
  assert.equal(d.temperature, 34.1);
  assert.equal(d.extra, "水温");
});

test("名前が水温計なら category が未知でもセンサーにする", () => {
  const [d] = mapTuyaDevices([
    {
      id: "probe",
      name: "水温計",
      category: "qt",
      status: [{ code: "temp_current", value: 188 }],
    },
  ]);
  assert.equal(d.kind, "sensor");
  assert.equal(d.temperature, 18.8);
  assert.equal(d.extra, "水温");
});

test("温湿度センサーは気温として取り込み、水温にはしない", () => {
  const [d] = mapTuyaDevices([
    {
      id: "th",
      name: "リビング",
      category: "wsdcg",
      status: [
        { code: "temp_current", value: 264 },
        { code: "humidity_value", value: 480 },
      ],
    },
  ]);
  assert.equal(d.kind, "sensor");
  assert.equal(d.temperature, 26.4);
  assert.equal(d.humidity, 48);
  assert.notEqual(d.extra, "水温");
});

test("コンセントは温度があってもプラグのまま", () => {
  const [d] = mapTuyaDevices([
    {
      id: "plug",
      name: "テレビ横",
      category: "cz",
      status: [
        { code: "switch_1", value: true },
        { code: "cur_current", value: 120 },
      ],
    },
  ]);
  assert.equal(d.kind, "plug");
  assert.equal(d.on, true);
  assert.equal(d.temperature, undefined);
});

test("照明 dj は light で、kg を含む category でもコンセントに落とさない", () => {
  const [d] = mapTuyaDevices([{ id: "bulb", name: "電球", category: "dj", status: [{ code: "switch_led", value: true }] }]);
  assert.equal(d.kind, "light");
  assert.equal(d.on, true);
});

test("短い category の部分一致でカーテンにしない", () => {
  const [d] = mapTuyaDevices([{ id: "x", name: "未知", category: "clk" }]);
  assert.equal(d.kind, "other");
});

test("カーテン cl は開きを反転して読み、percent_control へ反転して送る", () => {
  const [d] = mapTuyaDevices([
    {
      id: "c1",
      name: "カーテン",
      category: "cl",
      status: [
        { code: "percent_control", value: 20 },
        { code: "control", value: "stop" },
      ],
    },
  ]);
  assert.equal(d.kind, "curtain");
  assert.equal(d.position, 80);
  const commands = tuyaCommandsFromPatch(
    [{ code: "percent_control", value: 20 }],
    d,
    { position: 100 },
  );
  assert.deepEqual(commands, [{ code: "percent_control", value: 0 }]);
});

test("照明の明るさは 0-1000 を百分率へ写して戻す", () => {
  const [d] = mapTuyaDevices([
    {
      id: "l1",
      name: "電球",
      category: "dj",
      status: [
        { code: "switch_led", value: true },
        { code: "bright_value", value: 500 },
      ],
    },
  ]);
  assert.equal(d.kind, "light");
  assert.equal(d.brightness, 50);
  const commands = tuyaCommandsFromPatch(
    [
      { code: "switch_led", value: true },
      { code: "bright_value", value: 500 },
    ],
    d,
    { brightness: 80, on: true },
  );
  assert.deepEqual(commands, [
    { code: "switch_led", value: true },
    { code: "bright_value", value: 800 },
  ]);
});

test("エアコン kt は温度とモードの DP を機器の語彙のまま送る", () => {
  const device: Device = {
    id: "smartlife:ac",
    name: "エアコン",
    room: "リビング",
    brand: "smartlife",
    kind: "ac",
    online: true,
    source: "live",
    nativeId: "ac",
    connector: "smartlife",
    extra: "kt",
    mode: "cool",
    targetTemp: 26,
  };
  const commands = tuyaCommandsFromPatch(
    [
      { code: "switch", value: true },
      { code: "temp_set", value: 260 },
      { code: "mode", value: "cold" },
      { code: "fan_speed_enum", value: "auto" },
    ],
    device,
    { on: true, targetTemp: 24, mode: "heat", fanSpeed: "3" },
  );
  assert.deepEqual(commands, [
    { code: "switch", value: true },
    { code: "temp_set", value: 240 },
    { code: "mode", value: "hot" },
    { code: "fan_speed_enum", value: "middle" },
  ]);
});

test("機器一覧の local_key を拾う。16 文字でないものは鍵として使えないので拾わない", () => {
  const keys = new Map<string, string>();
  collectLocalKeys(
    [
      { id: "eb70", local_key: "0123456789abcdef" },
      { device_id: "ab12", local_key: "short" },
      { id: "cd34" },
    ],
    keys,
  );
  assert.deepEqual([...keys], [["eb70", "0123456789abcdef"]]);
});

test("specifications の status と functions から dp 番号 → コードを作る", () => {
  const dps = dpMapFromSpecification({
    category: "wsdcg",
    status: [
      { code: "va_temperature", dp_id: 1, type: "Integer", values: "{}" },
      { code: "temp_unit_convert", dp_id: 9, type: "Enum", values: "{}" },
    ],
    functions: [
      { code: "temp_unit_convert", dp_id: 9, type: "Enum", values: "{}" },
      { code: "maxtemp_set", dp_id: 10, type: "Integer", values: "{}" },
    ],
  });
  assert.deepEqual(dps, { "1": "va_temperature", "9": "temp_unit_convert", "10": "maxtemp_set" });
  assert.deepEqual(dpMapFromSpecification(null), {});
});
