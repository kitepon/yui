import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// 家の保存と家電送信だけを置き換え、サーバーと画面の実行処理をそのまま通す。
const fixtureUrl = `data:text/javascript,${encodeURIComponent(`
  export const state = { snap: null, sent: [], events: [] };
  export const loadHomeRecord = async () => ({ snap: state.snap });
  export const saveHomeRecord = async (_id, patch) => Object.assign(state.snap, patch);
  export const listAutomationHomeIds = () => ['home'];
  export const daikinConfigured = () => false;
  export const billingConfigured = () => false;
  export const newWaveId = () => 'wave';
  export const recordEvent = (event) => state.events.push(event);
  export const recordHomeSamples = () => {};
  export const pruneAnalysis = () => {};
  export const toast = { message() {} };
  export const useHome = { getState: () => ({
    ...state.snap,
    markAutomationFired(id, key) {
      state.snap.automations.find((auto) => auto.id === id).lastFiredKey = key;
    },
    markLastRanAutomation(id) { state.snap.lastRanAutomationId = id; },
  }) };
  export async function runCommand(device, patch) {
    state.sent.push({ deviceId: device.id, on: patch.on });
    Object.assign(device, patch);
  }
  export async function executeAction(_id, snap, action) {
    await runCommand(snap.devices.find((device) => device.id === action.deviceId), { on: action.on });
    return snap;
  }
  export function unexpected() { throw new Error('この試験では外部接続を行わない'); }
  export {
    unexpected as remoSync, unexpected as switchbotRefreshSensors,
    unexpected as tuyaRefreshSensors, unexpected as daikinSync,
    unexpected as isRetiredDaikinOutdoorId, unexpected as homeBelongsToLanOwner,
    unexpected as startBackupRunner, unexpected as loadEntitlement,
  };
`)}`;
const mocked = new Set(
  [
    "home/remo",
    "home/switchbot",
    "home/tuya",
    "home/daikin",
    "home/run",
    "home/store",
    "server/lan-owner",
    "server/home-db",
    "server/execute",
    "server/home-backup",
    "server/billing",
    "server/analysis",
  ].map((path) => new URL(`../src/lib/${path}.ts`, import.meta.url).href),
);
const sourceRoot = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "sonner") return { url: fixtureUrl, shortCircuit: true };
    let url;
    if (specifier.startsWith("@/")) url = new URL(`${specifier.slice(2)}.ts`, sourceRoot).href;
    else if (specifier.startsWith(".") && context.parentURL?.startsWith(sourceRoot.href)) {
      url = new URL(specifier.endsWith(".ts") ? specifier : `${specifier}.ts`, context.parentURL)
        .href;
    }
    if (url) return { url: mocked.has(url) ? fixtureUrl : url, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { state } = await import(fixtureUrl);
const { tickHome } = await import("../src/lib/server/runner.ts");
const { fireScheduledAutomations } = await import("../src/lib/home/run-automation.ts");
hooks.deregister();

function reset() {
  state.sent = [];
  state.events = [];
  state.snap = {
    climate: {},
    credentials: { natureToken: "", switchbotToken: "", switchbotSecret: "", tuyaAccessId: "" },
    devices: [
      { id: "ac", name: "エアコン", connector: "daikin", kind: "ac", on: true, outdoorTemp: 20 },
      { id: "water", temperature: 25.2 },
      { id: "lamp", on: false },
    ],
    automations: [
      {
        id: "outdoor",
        name: "外気取り込み優先",
        enabled: true,
        skipContinuous: true,
        trigger: { type: "sensor", deviceId: "ac", metric: "outdoorTemp", op: "lte", value: 24 },
        actions: [{ id: "off", deviceId: "ac", on: false }],
      },
      {
        id: "tank",
        name: "水槽水温中温域",
        enabled: true,
        skipContinuous: true,
        trigger: {
          type: "sensor",
          deviceId: "water",
          metric: "temperature",
          op: "between",
          value: 25,
          valueMax: 25.5,
        },
        actions: [{ id: "on", deviceId: "ac", on: true }],
      },
    ],
  };
}

const runners = [
  ["サーバー", () => tickHome("home")],
  [
    "画面",
    async () => {
      fireScheduledAutomations();
      // 画面の実行口は送信を待たず戻るため、その回の非同期処理を完了させる。
      await new Promise((resolve) => setImmediate(resolve));
    },
  ],
];

for (const [name, tick] of runners) {
  test(`${name}: 条件成立が続く複数回の判定で交互切替も再送も起こさない`, async () => {
    reset();
    for (let i = 0; i < 4; i += 1) await tick();
    assert.deepEqual(state.sent, [{ deviceId: "ac", on: false }]);
    assert.equal(state.snap.lastRanAutomationId, "outdoor");
    if (name === "サーバー") {
      assert.ok(
        state.events.some(
          (event) => event.automationId === "outdoor" && event.reason === "skip_continuous",
        ),
      );
      const blocked = state.events.filter(
        (event) => event.automationId === "tank" && event.reason === "claimed_by",
      );
      assert.equal(blocked.length, 4);
      assert.ok(blocked.every((event) => JSON.parse(event.detail).by === "outdoor"));
    }
  });

  test(`${name}: 上位条件が外れた回だけ下位が動き、再成立したら上位へ戻る`, async () => {
    reset();
    await tick();
    state.snap.devices[0].outdoorTemp = 28;
    await tick();
    state.snap.devices[0].outdoorTemp = 20;
    await tick();
    await tick();
    assert.deepEqual(state.sent, [
      { deviceId: "ac", on: false },
      { deviceId: "ac", on: true },
      { deviceId: "ac", on: false },
    ]);
  });

  test(`${name}: 上位の再送を省いても下位の別機器は動く`, async () => {
    reset();
    state.snap.lastRanAutomationId = "outdoor";
    state.snap.automations[1].actions.push({ id: "lamp-on", deviceId: "lamp", on: true });
    await tick();
    assert.deepEqual(state.sent, [{ deviceId: "lamp", on: true }]);
  });

  test(`${name}: 上位を無効にするか並びを変えると次の上位が機器を取る`, async () => {
    for (const change of [
      () => {
        state.snap.automations[0].enabled = false;
      },
      () => {
        state.snap.automations.reverse();
      },
    ]) {
      reset();
      await tick();
      change();
      await tick();
      assert.deepEqual(state.sent, [
        { deviceId: "ac", on: false },
        { deviceId: "ac", on: true },
      ]);
    }
  });

  test(`${name}: 打ち切り設定は再送省略中も下位の別機器を止める`, async () => {
    reset();
    state.snap.automations[0].stopOnMatch = true;
    state.snap.automations[1].actions.push({ id: "lamp-on", deviceId: "lamp", on: true });
    await tick();
    await tick();
    assert.deepEqual(state.sent, [{ deviceId: "ac", on: false }]);
  });
}
