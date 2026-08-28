import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDaikinWrite,
  deviceFromDsiot,
  flattenDsiot,
  parseDaikinAddrs,
  tempListFromRange,
  tempListFromSignedRange,
} from "./daikin.ts";

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

test("相対温度: 符号付き温度×2 を 0.5 刻みにする", () => {
  assert.deepEqual(tempListFromSignedRange({ mi: "FE", mx: "02" }), ["-1", "-0.5", "0", "0.5", "1"]);
  assert.equal(tempListFromSignedRange({ mi: "F0", mx: "10" })?.[0], "-8");
  assert.equal(tempListFromSignedRange({ mi: "F0", mx: "10" })?.at(-1), "8");
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
              { pn: "p_09", pv: "0A00" },
              { pn: "p_05", pv: "100000" },
              { pn: "p_06", pv: "100000" },
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
  assert.equal(device.fanSpeed, "auto");
  assert.equal(device.fanSwing, "auto");
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
  assert.equal(device.fanSpeed, undefined);
  assert.equal(device.fanSwing, undefined);
});

test("読み取り: 風量はモード別プロパティ、未知の符号は偽らない。除湿は風量なし", () => {
  const withFan = (mode: string, fanPn: string, fanPv: string) => {
    const m = new Map(flattenDsiot(STATUS));
    m.get("/dgc_status/e_1002/e_3001/p_01")!.pv = mode;
    m.set(`/dgc_status/e_1002/e_3001/${fanPn}`, { pn: fanPn, pv: fanPv });
    return deviceFromDsiot("リビング", "h", "m", m);
  };
  assert.equal(withFan("0100", "p_0A", "0B00").fanSpeed, "quiet");
  assert.equal(withFan("0000", "p_28", "0500").fanSpeed, "3");
  assert.equal(withFan("0300", "p_26", "0700").fanSpeed, "5");
  assert.equal(withFan("0200", "p_09", "FFFF").fanSpeed, undefined);
  const dry = withFan("0500", "p_09", "0A00");
  assert.equal(dry.mode, "dry");
  assert.equal(dry.fanSpeed, undefined);
});

test("読み取り: 風向は自動 100000・固定 000000・スイング 0F0000", () => {
  const withSwing = (mode: string, vPn: string, hPn: string, v: string, h: string) => {
    const m = new Map(flattenDsiot(STATUS));
    m.get("/dgc_status/e_1002/e_3001/p_01")!.pv = mode;
    m.set(`/dgc_status/e_1002/e_3001/${vPn}`, { pn: vPn, pv: v });
    m.set(`/dgc_status/e_1002/e_3001/${hPn}`, { pn: hPn, pv: h });
    return deviceFromDsiot("リビング", "h", "m", m);
  };
  assert.equal(withSwing("0200", "p_05", "p_06", "0F0000", "000000").fanSwing, "vertical");
  assert.equal(withSwing("0200", "p_05", "p_06", "000000", "0F0000").fanSwing, "horizontal");
  assert.equal(withSwing("0200", "p_05", "p_06", "0F0000", "0F0000").fanSwing, "both");
  assert.equal(withSwing("0500", "p_22", "p_23", "100000", "100000").fanSwing, "auto");
  assert.equal(withSwing("0200", "p_05", "p_06", "000000", "000000").fanSwing, "off");
  assert.equal(withSwing("0800", "p_05", "p_06", "0F0000", "0F0000").fanSwing, undefined);
});

test("書き込み: 風量は現在モードのプロパティへ送る。除湿では送れない", () => {
  assert.deepEqual(buildDaikinWrite(AC, { fanSpeed: "quiet", on: true }), [
    { pn: "e_A002", pch: [{ pn: "p_01", pv: "01" }] },
    { pn: "e_3001", pch: [{ pn: "p_09", pv: "0B00" }] },
  ]);
  assert.deepEqual(buildDaikinWrite({ ...AC, mode: "heat" }, { fanSpeed: "3" }), [
    { pn: "e_3001", pch: [{ pn: "p_0A", pv: "0500" }] },
  ]);
  assert.throws(
    () => buildDaikinWrite({ ...AC, mode: "dry" }, { fanSpeed: "auto" }),
    /風量/,
  );
});

test("書き込み: 風向は上下・左右を対で送る。加湿では送れない", () => {
  assert.deepEqual(buildDaikinWrite(AC, { fanSwing: "both" }), [
    { pn: "e_3001", pch: [{ pn: "p_05", pv: "0F0000" }, { pn: "p_06", pv: "0F0000" }] },
  ]);
  assert.deepEqual(buildDaikinWrite(AC, { fanSwing: "vertical" }), [
    { pn: "e_3001", pch: [{ pn: "p_05", pv: "0F0000" }, { pn: "p_06", pv: "000000" }] },
  ]);
  assert.deepEqual(buildDaikinWrite(AC, { fanSwing: "auto" }), [
    { pn: "e_3001", pch: [{ pn: "p_05", pv: "100000" }, { pn: "p_06", pv: "100000" }] },
  ]);
  assert.deepEqual(buildDaikinWrite({ ...AC, mode: "dry" }, { fanSwing: "off" }), [
    { pn: "e_3001", pch: [{ pn: "p_22", pv: "000000" }, { pn: "p_23", pv: "000000" }] },
  ]);
  assert.throws(
    () => buildDaikinWrite({ ...AC, mode: "humidify" }, { fanSwing: "off" }),
    /風向/,
  );
});

test("読み取り: 自動運転は p_1D が無ければ相対値 p_1F を使う", () => {
  const m = new Map(flattenDsiot(STATUS));
  m.get("/dgc_status/e_1002/e_3001/p_01")!.pv = "0300";
  m.set("/dgc_status/e_1002/e_3001/p_1F", { pn: "p_1F", pv: "00", md: { st: 245, mi: "F0", mx: "10" } });
  const device = deviceFromDsiot("リビング", "h", "m", m);
  assert.equal(device.mode, "auto");
  assert.equal(device.targetTemp, 0);
  assert.equal(device.acModes?.auto?.[0], "-8");
  assert.equal(device.acModes?.auto?.at(-1), "8");
  assert.deepEqual(buildDaikinWrite(device, { targetTemp: 1 }), [
    { pn: "e_3001", pch: [{ pn: "p_1F", pv: "02" }] },
  ]);
  assert.deepEqual(buildDaikinWrite(device, { targetTemp: -1 }), [
    { pn: "e_3001", pch: [{ pn: "p_1F", pv: "FE" }] },
  ]);
});

test("読み取り: 外気温は adr_0200 の e_A00D から取る", () => {
  const m = new Map(flattenDsiot(STATUS));
  m.set("/dgc_status/e_1003/e_A00D/p_01", { pn: "p_01", pv: "4300" });
  const device = deviceFromDsiot("リビング", "h", "m", m);
  assert.equal(device.outdoorTemp, 33.5);
});
