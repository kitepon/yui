import { test } from "node:test";
import assert from "node:assert/strict";
import { acModesFromRange, appliancesToDevices, pickAcTemp, pickRemoSignal } from "./remo.ts";

test("オンとオフの信号名があれば向きどおりに選ぶ", () => {
  const signals = [
    { id: "s-on", name: "オン" },
    { id: "s-off", name: "オフ" },
  ];
  assert.equal(pickRemoSignal(signals, true)?.id, "s-on");
  assert.equal(pickRemoSignal(signals, false)?.id, "s-off");
});

test("信号がひとつだけならトグルとして送る（常夜灯）", () => {
  const signals = [{ id: "s-1", name: "常夜灯" }];
  assert.equal(pickRemoSignal(signals, true)?.id, "s-1");
  assert.equal(pickRemoSignal(signals, false)?.id, "s-1");
});

test("向きの分からない信号が複数あるなら選ばない", () => {
  const signals = [
    { id: "a", name: "1ch" },
    { id: "b", name: "2ch" },
  ];
  assert.equal(pickRemoSignal(signals, true), null);
});

test("信号が無ければ選ばない", () => {
  assert.equal(pickRemoSignal([], true), null);
});

test("能力表: 実機のモード名を結の語彙へ写し、温度は昇順・空文字は除く", () => {
  const out = acModesFromRange({
    cool: { temp: ["20", "18", "19"] },
    warm: { temp: ["22", "23"] },
    blow: { temp: [""] },
    auto: { temp: ["-1", "0", "1"] },
  });
  assert.deepEqual(out, {
    cool: ["18", "19", "20"],
    heat: ["22", "23"],
    fan: [],
    auto: ["-1", "0", "1"],
  });
});

test("能力表: range が無ければ undefined（従来動作へ委ねる）", () => {
  assert.equal(acModesFromRange(undefined), undefined);
});

test("温度選択: 絶対値モードは最も近い値へ寄せる", () => {
  const list = ["18", "18.5", "19", "19.5", "20"];
  assert.equal(pickAcTemp(list, 17), "18");
  assert.equal(pickAcTemp(list, 19.5), "19.5");
  assert.equal(pickAcTemp(list, 25), "20");
});

test("温度選択: 相対値モードは一致だけ許し、外れは送らない", () => {
  const list = ["-2", "-1", "0", "1", "2"];
  assert.equal(pickAcTemp(list, 0), "0");
  assert.equal(pickAcTemp(list, -1), "-1");
  assert.equal(pickAcTemp(list, 26), null);
});

test("温度選択: 温度指定の無いモードは送らない", () => {
  assert.equal(pickAcTemp([], 26), null);
  assert.equal(pickAcTemp(undefined, 26), null);
});

test("同期: 自動モードの相対値 0 を 26 へ丸めない", () => {
  const [device] = appliancesToDevices([
    {
      id: "a1",
      nickname: "エアコン",
      type: "AC",
      settings: { temp: "0", mode: "auto", button: "" },
      aircon: { range: { modes: { auto: { temp: ["-1", "0", "1"] } } } },
    },
  ]);
  assert.equal(device.targetTemp, 0);
  assert.deepEqual(device.acModes, { auto: ["-1", "0", "1"] });
});
