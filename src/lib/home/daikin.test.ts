import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDaikinWrite, deviceFromDsiot, flattenDsiot, parseDaikinAddrs, tempListFromRange } from "./daikin.ts";

test("宛先: 部屋=IP と素の IP を読み分ける", () => {
  assert.deepEqual(parseDaikinAddrs("リビング=192.168.1.16, 192.168.1.17"), [
    { room: "リビング", host: "192.168.1.16" },
    { room: "その他", host: "192.168.1.17" },
  ]);
  assert.deepEqual(parseDaikinAddrs(undefined), []);
  assert.deepEqual(parseDaikinAddrs(""), []);
});

test("温度範囲: mi〜mx（温度×2）を 0.5 刻みのリストにする", () => {
  assert.deepEqual(tempListFromRange({ mi: "22", mx: "24" }), ["17", "17.5", "18"]);
  assert.deepEqual(tempListFromRange({}), []);
  assert.deepEqual(tempListFromRange(undefined), []);
});

// 実機 F80XTRXP（2020 うるさらX）の応答から要点を抜いた fixture
const STATUS = [
  {
    pn: "dgc_status",
    pch: [
      {
        pn: "e_1002",
        pch: [
          { pn: "e_A002", pch: [{ pn: "p_01", pv: "01" }] },
          {
            pn: "e_3001",
            pch: [
              { pn: "p_01", pv: "0200" },
              { pn: "p_02", pv: "30", md: { st: 245, mi: "22", mx: "40" } },
              { pn: "p_03", pv: "30", md: { st: 245, mi: "1C", mx: "3E" } },
            ],
          },
          {
            pn: "e_A00B",
            pch: [
              { pn: "p_01", pv: "1B" },
              { pn: "p_02", pv: "37" },
            ],
          },
        ],
      },
    ],
  },
];

test("読み取り: 実機応答から電源・モード・目標温度・室温・湿度・能力表を組み立てる", () => {
  const device = deviceFromDsiot("リビング", "192.168.1.16", "AABBCCDDEEFF", flattenDsiot(STATUS));
  assert.equal(device.id, "daikin:AABBCCDDEEFF");
  assert.equal(device.on, true);
  assert.equal(device.mode, "cool");
  assert.equal(device.targetTemp, 24);
  assert.equal(device.temperature, 27);
  assert.equal(device.humidity, 55);
  assert.equal(device.acModes?.cool?.[0], "17");
  assert.equal(device.acModes?.cool?.at(-1), "32");
  assert.equal(device.acModes?.heat?.[0], "14");
  assert.equal(device.acModes?.heat?.at(-1), "31");
  assert.deepEqual(device.acModes?.dry, []);
  assert.deepEqual(device.acModes?.auto, []);
});

const AC = deviceFromDsiot("リビング", "192.168.1.16", "MAC", flattenDsiot(STATUS));

test("書き込み: 停止は電源だけを送る", () => {
  assert.deepEqual(buildDaikinWrite(AC, { on: false }), [
    { pn: "e_A002", pch: [{ pn: "p_01", pv: "00" }] },
  ]);
});

test("書き込み: モード切替は電源オンとモードを送る", () => {
  assert.deepEqual(buildDaikinWrite({ ...AC, mode: "heat" }, { mode: "heat", on: true }), [
    { pn: "e_A002", pch: [{ pn: "p_01", pv: "01" }] },
    { pn: "e_3001", pch: [{ pn: "p_01", pv: "0100" }] },
  ]);
});

test("書き込み: 温度は現在モードのプロパティへ、実機の値へ写して送る", () => {
  assert.deepEqual(buildDaikinWrite(AC, { targetTemp: 25 }), [
    { pn: "e_3001", pch: [{ pn: "p_02", pv: "32" }] },
  ]);
  assert.deepEqual(buildDaikinWrite({ ...AC, mode: "heat" }, { targetTemp: 22.5 }), [
    { pn: "e_3001", pch: [{ pn: "p_03", pv: "2D" }] },
  ]);
  // 範囲外は端へ写す（冷房下限 17）
  assert.deepEqual(buildDaikinWrite(AC, { targetTemp: 5 }), [
    { pn: "e_3001", pch: [{ pn: "p_02", pv: "22" }] },
  ]);
});

test("書き込み: 温度を持たないモードへは温度を送らない", () => {
  assert.deepEqual(buildDaikinWrite({ ...AC, mode: "dry" }, { mode: "dry", targetTemp: 24 }), [
    { pn: "e_3001", pch: [{ pn: "p_01", pv: "0500" }] },
  ]);
});

test("書き込み: 除湿の目標湿度は種別と%を送り、連続は種別だけを送る", () => {
  const dryAc = { ...AC, mode: "dry" as const };
  assert.deepEqual(buildDaikinWrite(dryAc, { targetHumidity: 55, on: true }), [
    { pn: "e_A002", pch: [{ pn: "p_01", pv: "01" }] },
    { pn: "e_3001", pch: [{ pn: "p_31", pv: "01" }, { pn: "p_30", pv: "37" }] },
  ]);
  assert.deepEqual(buildDaikinWrite(dryAc, { targetHumidity: 0, on: true }), [
    { pn: "e_A002", pch: [{ pn: "p_01", pv: "01" }] },
    { pn: "e_3001", pch: [{ pn: "p_31", pv: "06" }] },
  ]);
  // 除湿以外では湿度を送らない
  assert.deepEqual(buildDaikinWrite(AC, { targetHumidity: 55 }), []);
});

test("読み取り: 除湿中は目標湿度を読み、連続は 0 とする", () => {
  const flat = flattenDsiot(STATUS);
  flat.get("/dgc_status/e_1002/e_3001/p_01")!.pv = "0500";
  const withDry = (kind, pct) => {
    const m = new Map(flat);
    m.set("/dgc_status/e_1002/e_3001/p_31", { pn: "p_31", pv: kind });
    m.set("/dgc_status/e_1002/e_3001/p_30", { pn: "p_30", pv: pct });
    return deviceFromDsiot("リビング", "h", "m", m);
  };
  assert.equal(withDry("01", "37").targetHumidity, 55);
  assert.equal(withDry("06", "37").targetHumidity, 0);
});

test("加湿: p_32 を持つ機種だけ加湿モードが現れ、目標湿度は p_33/p_32 で読み書きする", () => {
  const flat = flattenDsiot(STATUS);
  assert.equal(deviceFromDsiot("r", "h", "m", flat).acModes?.humidify, undefined);
  flat.set("/dgc_status/e_1002/e_3001/p_32", { pn: "p_32", pv: "28" });
  flat.set("/dgc_status/e_1002/e_3001/p_33", { pn: "p_33", pv: "01" });
  flat.get("/dgc_status/e_1002/e_3001/p_01")!.pv = "0800";
  const device = deviceFromDsiot("r", "h", "m", flat);
  assert.equal(device.mode, "humidify");
  assert.deepEqual(device.acModes?.humidify, []);
  assert.equal(device.targetHumidity, 40);
  assert.deepEqual(buildDaikinWrite(device, { targetHumidity: 45 }), [
    { pn: "e_3001", pch: [{ pn: "p_33", pv: "01" }, { pn: "p_32", pv: "2D" }] },
  ]);
  assert.deepEqual(buildDaikinWrite(device, { mode: "humidify", targetHumidity: 0, on: true }), [
    { pn: "e_A002", pch: [{ pn: "p_01", pv: "01" }] },
    { pn: "e_3001", pch: [{ pn: "p_01", pv: "0800" }, { pn: "p_33", pv: "06" }] },
  ]);
});

test("読み取り: 未知のモード値は偽らずに undefined にする", () => {
  const flat = flattenDsiot(STATUS);
  flat.get("/dgc_status/e_1002/e_3001/p_01")!.pv = "2F01";
  const device = deviceFromDsiot("リビング", "h", "m", flat);
  assert.equal(device.mode, undefined);
  assert.equal(device.targetTemp, undefined);
});
