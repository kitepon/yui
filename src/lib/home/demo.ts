import type { Climate, Device, Scene } from "./types";

export const DEMO_CLIMATE: Climate = {
  temperature: 26.4,
  humidity: 48,
  lux: 120,
  label: "リビング · Remo",
};

export const DEMO_DEVICES: Device[] = [
  {
    id: "demo-living-light",
    name: "シーリング",
    room: "リビング",
    brand: "odelec",
    kind: "light",
    online: true,
    source: "demo",
    nativeId: "demo-living-light",
    connector: "demo",
    on: true,
    brightness: 72,
    extra: "Alexa経由が本線。Remoに学習すれば直操作可",
  },
  {
    id: "demo-living-ac",
    name: "エアコン",
    room: "リビング",
    brand: "daikin",
    kind: "ac",
    online: true,
    source: "demo",
    nativeId: "demo-living-ac",
    connector: "demo",
    on: true,
    targetTemp: 26,
    mode: "cool",
    fanSpeed: "auto",
    fanSwing: "off",
    extra: "Alexa経由が本線。Remoのエアコン登録が最短",
  },
  {
    id: "demo-living-curtain",
    name: "カーテン",
    room: "リビング",
    brand: "switchbot",
    kind: "curtain",
    online: true,
    source: "demo",
    nativeId: "demo-living-curtain",
    connector: "demo",
    on: true,
    position: 80,
  },
  {
    id: "demo-living-plug",
    name: "テレビ横プラグ",
    room: "リビング",
    brand: "smartlife",
    kind: "plug",
    online: true,
    source: "demo",
    nativeId: "demo-living-plug",
    connector: "demo",
    on: false,
  },
  {
    id: "demo-living-sensor",
    name: "Remo センサー",
    room: "リビング",
    brand: "nature",
    kind: "sensor",
    online: true,
    source: "demo",
    nativeId: "demo-living-sensor",
    connector: "demo",
    temperature: 26.4,
    humidity: 48,
    lux: 120,
  },
  {
    id: "demo-bed-light",
    name: "ベッドサイド",
    room: "寝室",
    brand: "smartlife",
    kind: "light",
    online: true,
    source: "demo",
    nativeId: "demo-bed-light",
    connector: "demo",
    on: false,
    brightness: 30,
  },
  {
    id: "demo-bed-ac",
    name: "寝室エアコン",
    room: "寝室",
    brand: "daikin",
    kind: "ac",
    online: true,
    source: "demo",
    nativeId: "demo-bed-ac",
    connector: "demo",
    on: false,
    targetTemp: 27,
    mode: "dry",
    fanSwing: "off",
  },
  {
    id: "demo-bed-bot",
    name: "照明スイッチ",
    room: "寝室",
    brand: "switchbot",
    kind: "bot",
    online: true,
    source: "demo",
    nativeId: "demo-bed-bot",
    connector: "demo",
    on: false,
  },
];

export const SCENES: Scene[] = [
  {
    id: "morning",
    name: "おはよう",
    hint: "カーテンを開け、涼しく点灯",
    steps: [
      { match: { kind: "curtain" }, patch: { on: true, position: 100 } },
      { match: { kind: "light", room: "リビング" }, patch: { on: true, brightness: 70 } },
      { match: { kind: "ac", room: "リビング" }, patch: { on: true, mode: "cool", targetTemp: 26 } },
      { match: { kind: "light", room: "寝室" }, patch: { on: false } },
    ],
  },
  {
    id: "leave",
    name: "いってきます",
    hint: "照明・空調を止めて戸締まり",
    steps: [
      { match: { kind: "light" }, patch: { on: false } },
      { match: { kind: "ac" }, patch: { on: false } },
      { match: { kind: "plug" }, patch: { on: false } },
      { match: { kind: "curtain" }, patch: { on: false, position: 0 } },
      { match: { kind: "lock" }, patch: { on: true } },
    ],
  },
  {
    id: "home",
    name: "ただいま",
    hint: "リビングを起こす",
    steps: [
      { match: { kind: "light", room: "リビング" }, patch: { on: true, brightness: 80 } },
      { match: { kind: "ac", room: "リビング" }, patch: { on: true, mode: "cool", targetTemp: 26 } },
      { match: { kind: "curtain" }, patch: { on: true, position: 70 } },
      { match: { kind: "lock" }, patch: { on: false } },
    ],
  },
  {
    id: "night",
    name: "おやすみ",
    hint: "落とす、残す、静かに",
    steps: [
      { match: { kind: "light", room: "リビング" }, patch: { on: false } },
      { match: { kind: "plug" }, patch: { on: false } },
      { match: { kind: "light", room: "寝室" }, patch: { on: true, brightness: 18 } },
      { match: { kind: "ac", room: "寝室" }, patch: { on: true, mode: "dry", targetTemp: 27 } },
      { match: { kind: "curtain" }, patch: { on: false, position: 0 } },
      { match: { kind: "lock" }, patch: { on: true } },
    ],
  },
];

export function matchesStep(device: Device, step: Scene["steps"][number]) {
  const { match } = step;
  if (match.id && device.id !== match.id) return false;
  if (match.kind && device.kind !== match.kind) return false;
  if (match.room && device.room !== match.room) return false;
  if (match.brand && device.brand !== match.brand) return false;
  if (device.kind === "sensor") return false;
  return true;
}
