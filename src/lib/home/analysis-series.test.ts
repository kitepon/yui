import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectOnChanges,
  collectSensorSamples,
  heldSkipReason,
  seriesLabel,
  shouldWriteSkip,
  shouldWriteStopped,
} from "./analysis-series.ts";
import type { Device } from "./types.ts";

function live(over: Partial<Device>): Device {
  return {
    id: "d1",
    name: "センサー",
    room: "リビング",
    brand: "nature",
    kind: "sensor",
    online: true,
    source: "live",
    nativeId: "n1",
    connector: "nature",
    ...over,
  };
}

test("climate は室温・湿度・照度になり、外気温と水温は機器から取る", () => {
  const samples = collectSensorSamples({
    climate: { temperature: 24.2, humidity: 51, lux: 80, label: "Remo" },
    devices: [
      live({ id: "daikin:1", name: "エアコン", kind: "ac", connector: "daikin", brand: "daikin", outdoorTemp: 19.5, temperature: 25 }),
      live({ id: "water", name: "水槽", extra: "水温", temperature: 25.4 }),
    ],
  });
  assert.deepEqual(
    samples.map((s) => `${s.deviceId}:${s.metric}:${s.value}`),
    [
      "climate:temperature:24.2",
      "climate:humidity:51",
      "climate:lux:80",
      "daikin:1:temperature:25",
      "daikin:1:outdoorTemp:19.5",
      "water:temperature:25.4",
    ],
  );
  assert.equal(seriesLabel("climate", "temperature"), "室温");
  assert.equal(seriesLabel("daikin:1", "outdoorTemp", { name: "エアコン" }), "エアコン 外気温");
  assert.equal(seriesLabel("water", "temperature", { name: "水槽", extra: "水温" }), "水槽 水温");
});

test("demo 機器の数値は取らない", () => {
  const samples = collectSensorSamples({
    climate: { temperature: null, humidity: null, lux: null, label: "" },
    devices: [live({ source: "demo", temperature: 30 })],
  });
  assert.deepEqual(samples, []);
});

test("入切は前回と同じなら書かない", () => {
  const devices = [live({ id: "plug", kind: "plug", on: true })];
  const first = collectOnChanges(devices, new Map());
  assert.deepEqual(first, [{ deviceId: "plug", metric: "on", value: 1 }]);
  const again = collectOnChanges(devices, new Map([["plug", 1]]));
  assert.deepEqual(again, []);
  const off = collectOnChanges([live({ id: "plug", kind: "plug", on: false })], new Map([["plug", 1]]));
  assert.deepEqual(off, [{ deviceId: "plug", metric: "on", value: 0 }]);
});

test("読み返せない機器の保持は unreadable、目標どおりは already_applied", () => {
  const ir = live({ id: "ir", kind: "ir", connector: "nature" });
  const ac = live({
    id: "ac",
    kind: "ac",
    connector: "daikin",
    brand: "daikin",
  });
  assert.equal(heldSkipReason(ir), "unreadable");
  assert.equal(heldSkipReason(ac), "already_applied");
});

test("連続 skip は畳み、sent は畳まない", () => {
  assert.equal(shouldWriteSkip(undefined, "already_applied"), true);
  assert.equal(shouldWriteSkip({ outcome: "skipped", reason: "already_applied" }, "already_applied"), false);
  assert.equal(shouldWriteSkip({ outcome: "skipped", reason: "already_applied" }, "claimed_by"), true);
  assert.equal(shouldWriteSkip({ outcome: "sent", reason: null }, "already_applied"), true);
});

test("判定の打ち切りは、同じ行に打ち切られているあいだ1行に畳む", () => {
  const detail = JSON.stringify({ by: "auto-room", name: "室温基準" });
  const stopped = { outcome: "skipped", reason: "stopped_by", detail };
  assert.equal(shouldWriteStopped(undefined, detail), true);
  assert.equal(shouldWriteStopped(stopped, detail), false);
  // 打ち切る行が替わった。
  assert.equal(shouldWriteStopped(stopped, JSON.stringify({ by: "auto-water", name: "水温" })), true);
  // あいだに送った・外れたが入った。
  assert.equal(shouldWriteStopped({ outcome: "sent", reason: null, detail: null }, detail), true);
  assert.equal(shouldWriteStopped({ outcome: "left", reason: null, detail: null }, detail), true);
  assert.equal(shouldWriteStopped({ outcome: "skipped", reason: "already_applied", detail: null }, detail), true);
});
