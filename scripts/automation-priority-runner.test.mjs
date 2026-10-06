import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mock, test } from "node:test";

// 家の保存と家電送信だけを置き換え、サーバーと画面の実行処理をそのまま通す。
// グループを動かした記録は、本物の保存口と同じ関数で付ける。
const groupUrl = new URL("../src/lib/home/device-group.ts", import.meta.url).href;
const fixtureUrl = `data:text/javascript,${encodeURIComponent(`
  import { stampGroupOperation } from ${JSON.stringify(groupUrl)};
  export const state = { snap: null, sent: [], events: [] };
  export const loadHomeRecord = async () => ({ snap: state.snap });
  export const saveHomeRecord = async (_id, patch) => Object.assign(state.snap, patch);
  export const saveDeviceGroupStates = async (_id, update) => {
    const next = update(state.snap);
    if (next) state.snap.deviceGroupStates = next;
    return state.snap;
  };
  export function operate(deviceId, patch) {
    Object.assign(state.snap.devices.find((device) => device.id === deviceId), patch);
    state.snap.deviceGroupStates = stampGroupOperation(
      state.snap.deviceGroups, state.snap.deviceGroupStates, deviceId, new Date().toISOString(),
    );
  }
  export const saveDeviceReadings = async (_id, _before, devices, extra = {}) => Object.assign(state.snap, extra, { devices });
  export const listAutomationHomeIds = () => ['home'];
  export const daikinConfigured = () => false;
  export const billingConfigured = () => false;
  export const newWaveId = () => 'wave';
  export const recordEvent = (event) => state.events.push(event);
  export const recordHomeSamples = () => {};
  export const pruneAnalysis = () => {};
  export const startTuyaLanDiscovery = () => {};
  export const tuyaLanRefreshSensors = async () => ({ read: new Set(), errors: [] });
  export const tuyaLanTargetOf = () => undefined;
  export const tuyaLanDiscoveryStatus = () => ({ listening: false, seen: 0 });
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
    operate(action.deviceId, {});
    return snap;
  }
  export function unexpected() { throw new Error('この試験では外部接続を行わない'); }
  export {
    unexpected as remoSync, unexpected as switchbotRefreshSensors,
    unexpected as tuyaRefreshSensors, unexpected as daikinSync,
    unexpected as isRetiredDaikinOutdoorId, unexpected as homeBelongsToLanOwner,
    unexpected as startBackupRunner, unexpected as loadEntitlement,
    unexpected as tuyaLanControl,
  };
`)}`;
const mocked = new Set(
  [
    "home/remo",
    "home/switchbot",
    "home/tuya",
    "home/tuya-lan",
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
const { state, operate } = await import(fixtureUrl);
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
        trigger: { type: "sensor", deviceId: "ac", metric: "outdoorTemp", op: "lte", value: 24 },
        actions: [{ id: "off", deviceId: "ac", on: false, skipContinuous: true }],
      },
      {
        id: "tank",
        name: "水槽水温中温域",
        enabled: true,
        trigger: {
          type: "sensor",
          deviceId: "water",
          metric: "temperature",
          op: "between",
          value: 25,
          valueMax: 25.5,
        },
        actions: [{ id: "on", deviceId: "ac", on: true, skipContinuous: true }],
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

// ここから下はサーバーだけ。グループの判定はサーバーの実行口が持つ。
const T0 = Date.parse("2026-10-06T00:00:00.000Z"); // 日本時間 09:00
const MIN = 60 * 1000;

function fanHome({ skipContinuous = false } = {}) {
  state.sent = [];
  state.events = [];
  state.snap = {
    climate: {},
    lastScene: null,
    credentials: { natureToken: "", switchbotToken: "", switchbotSecret: "", tuyaAccessId: "" },
    devices: [
      { id: "humid", name: "湿度計", kind: "sensor", humidity: 50 },
      { id: "fan-on", name: "換気扇オン", connector: "nature", kind: "ir" },
      { id: "fan-off", name: "換気扇オフ", connector: "nature", kind: "ir" },
      { id: "lamp", name: "照明", connector: "switchbot", kind: "plug", on: false },
    ],
    deviceGroups: [{ id: "fan", name: "換気扇", deviceIds: ["fan-on", "fan-off"], lockMinutes: 10 }],
    deviceGroupStates: {},
    automations: [
      {
        id: "on",
        name: "湿ったら回す",
        enabled: true,
        trigger: { type: "sensor", deviceId: "humid", metric: "humidity", op: "gte", value: 60 },
        actions: [{ id: "on-act", deviceId: "fan-on", on: true, skipContinuous: skipContinuous || undefined }],
      },
      {
        id: "off",
        name: "乾いたら止める",
        enabled: true,
        trigger: { type: "sensor", deviceId: "humid", metric: "humidity", op: "lte", value: 59.9 },
        actions: [{ id: "off-act", deviceId: "fan-off", on: true, skipContinuous: skipContinuous || undefined }],
      },
    ],
  };
}

async function at(minute, humidity) {
  mock.timers.setTime(T0 + minute * MIN);
  if (humidity != null) state.snap.devices[0].humidity = humidity;
  await tickHome("home");
}

function groupTest(name, body) {
  test(`サーバー: ${name}`, async () => {
    mock.timers.enable({ apis: ["Date"], now: T0 });
    try {
      await body();
    } finally {
      mock.timers.reset();
    }
  });
}

const sentIds = () => state.sent.map((item) => item.deviceId);

groupTest("センサーが揺れても、止める時間のあいだは逆の機器を動かさない", async () => {
  fanHome();
  await at(0, 60.2);
  await at(1, 59.8);
  assert.deepEqual(sentIds(), ["fan-on"]);
  const blocked = state.events.find((event) => event.reason === "group_locked");
  assert.equal(blocked.automationId, "off");
  assert.equal(blocked.deviceId, "fan-off");
  assert.deepEqual(JSON.parse(blocked.detail), {
    group: "fan",
    name: "換気扇",
    until: new Date(T0 + 10 * MIN).toISOString(),
  });
  assert.equal(state.snap.deviceGroupStates.fan.pending.automationId, "off");
});

groupTest("乾いたままなら、止める時間が明けた回に一度だけ送る", async () => {
  fanHome();
  await at(0, 60.2);
  for (let minute = 1; minute < 10; minute += 1) await at(minute, 59.8);
  assert.deepEqual(sentIds(), ["fan-on"]);
  await at(10);
  assert.deepEqual(sentIds(), ["fan-on", "fan-off"]);
  assert.equal(state.snap.lastRanAutomationId, "off");
  assert.equal(state.snap.deviceGroupStates.fan.pending, undefined);
  for (let minute = 11; minute < 25; minute += 1) await at(minute);
  assert.deepEqual(sentIds(), ["fan-on", "fan-off"]);
});

groupTest("揺れ戻ったら止めた操作を取り消し、明けても送らない", async () => {
  fanHome({ skipContinuous: true });
  await at(0, 60.2);
  await at(1, 59.8);
  await at(2, 60.4);
  assert.equal(state.snap.deviceGroupStates.fan.pending, undefined);
  for (let minute = 3; minute < 14; minute += 1) await at(minute);
  assert.deepEqual(sentIds(), ["fan-on"]);
  await at(14, 59.8);
  assert.deepEqual(sentIds(), ["fan-on", "fan-off"]);
});

groupTest("揺れ続けたら、明けた時点で成立している側だけを送る", async () => {
  fanHome();
  await at(0, 60.2);
  await at(1, 59.8);
  await at(2, 60.4);
  assert.equal(state.snap.deviceGroupStates.fan.pending.automationId, "on");
  await at(3, 59.7);
  assert.equal(state.snap.deviceGroupStates.fan.pending.automationId, "off");
  for (let minute = 4; minute <= 10; minute += 1) await at(minute);
  assert.deepEqual(sentIds(), ["fan-on", "fan-off"]);
});

groupTest("人が動かしたら時間を数え直し、止めていた操作を捨てる", async () => {
  fanHome();
  await at(0, 60.2);
  await at(1, 59.8);
  mock.timers.setTime(T0 + 5 * MIN);
  operate("fan-on", {});
  assert.equal(state.snap.deviceGroupStates.fan.pending, undefined);
  for (let minute = 6; minute < 20; minute += 1) await at(minute);
  assert.deepEqual(sentIds(), ["fan-on"]);
  // 人の操作から10分が過ぎたあとの成立は、そのまま送る。
  await at(20, 61);
  assert.deepEqual(sentIds(), ["fan-on", "fan-on"]);
});

groupTest("同じオートメーションはグループの機器を続けて動かせる", async () => {
  fanHome();
  state.snap.automations[0].actions.push({ id: "both", deviceId: "fan-off", on: true });
  await at(0, 60.2);
  assert.deepEqual(sentIds(), ["fan-on", "fan-off"]);
});

groupTest("グループに入れていない機器は止めない", async () => {
  fanHome();
  state.snap.automations[1].actions.push({ id: "lamp-on", deviceId: "lamp", on: true });
  await at(0, 60.2);
  await at(1, 59.8);
  assert.deepEqual(sentIds(), ["fan-on", "lamp"]);
  await at(10);
  assert.deepEqual(sentIds(), ["fan-on", "lamp", "fan-off"]);
});

groupTest("時刻の操作は止める時間が明けてから送る", async () => {
  fanHome();
  state.snap.automations = [
    {
      id: "nine",
      name: "9時に止める",
      enabled: true,
      trigger: { type: "time", repeat: "daily", hour: 9, minute: 0 },
      actions: [{ id: "nine-act", deviceId: "fan-off", on: true }],
    },
  ];
  mock.timers.setTime(T0 - 2 * MIN);
  operate("fan-on", {});
  await at(0);
  assert.deepEqual(sentIds(), []);
  assert.equal(state.snap.deviceGroupStates.fan.pending.automationId, "nine");
  await at(7);
  assert.deepEqual(sentIds(), []);
  await at(8);
  assert.deepEqual(sentIds(), ["fan-off"]);
  await at(9);
  assert.deepEqual(sentIds(), ["fan-off"]);
});

groupTest("範囲内で設定が違う機器は、止める時間が明けた回に送る", async () => {
  fanHome();
  state.snap.deviceGroups = [{ id: "lamp", name: "照明", deviceIds: ["lamp"], lockMinutes: 5 }];
  state.snap.automations = [
    {
      id: "range",
      name: "範囲内は点ける",
      enabled: true,
      trigger: { type: "sensor", deviceId: "humid", metric: "humidity", op: "between", value: 40, valueMax: 70 },
      actions: [{ id: "range-act", deviceId: "lamp", on: true }],
    },
  ];
  await at(0, 50);
  assert.deepEqual(sentIds(), ["lamp"]);
  mock.timers.setTime(T0 + 6 * MIN);
  operate("lamp", { on: false });
  for (let minute = 7; minute < 11; minute += 1) await at(minute);
  assert.deepEqual(sentIds(), ["lamp"]);
  assert.equal(state.snap.deviceGroupStates.lamp.pending, undefined);
  assert.ok(state.events.some((event) => event.automationId === "range" && event.reason === "group_locked"));
  await at(11);
  assert.deepEqual(sentIds(), ["lamp", "lamp"]);
});
