import { test } from "node:test";
import assert from "node:assert/strict";
import { mapTuyaDevices, readingsFromTuyaStatus } from "./tuya.ts";

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
