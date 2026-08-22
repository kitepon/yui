export type Brand =
  | "nature"
  | "switchbot"
  | "smartlife"
  | "alexa"
  | "odelec"
  | "daikin";

export type DeviceKind =
  | "light"
  | "ac"
  | "plug"
  | "curtain"
  | "bot"
  | "sensor"
  | "ir"
  | "lock"
  | "other";

export type AcMode = "cool" | "heat" | "dry" | "fan" | "auto" | "humidify";

export type DeviceSource = "live" | "demo";

export interface Device {
  id: string;
  name: string;
  room: string;
  brand: Brand;
  kind: DeviceKind;
  online: boolean;
  source: DeviceSource;
  nativeId: string;
  connector: Brand | "demo";
  on?: boolean;
  brightness?: number;
  temperature?: number;
  targetTemp?: number;
  /** 除湿の目標湿度（%）。0 は「連続」。対応機（ダイキン直結）だけが持つ。 */
  targetHumidity?: number;
  mode?: AcMode;
  /** エアコンの実機能力表（同期時に Nature から取得）。モード → 選べる温度値の昇順リスト。空はそのモードで温度指定不可。無い機器は従来の固定範囲で扱う。 */
  acModes?: Partial<Record<AcMode, string[]>>;
  humidity?: number;
  lux?: number;
  position?: number;
  extra?: string;
}

export interface Climate {
  temperature: number | null;
  humidity: number | null;
  lux: number | null;
  label: string;
}

export interface Scene {
  id: string;
  name: string;
  hint: string;
  steps: SceneStep[];
}

export interface SceneStep {
  match: {
    kind?: DeviceKind;
    room?: string;
    brand?: Brand;
    id?: string;
  };
  patch: Partial<
    Pick<Device, "on" | "brightness" | "targetTemp" | "mode" | "position">
  >;
}

export interface ConnectorStatus {
  id: Brand;
  connected: boolean;
  lastSync?: string;
  error?: string;
  deviceCount: number;
}

export interface Credentials {
  natureToken: string;
  switchbotToken: string;
  switchbotSecret: string;
  tuyaAccessId: string;
  tuyaSecret: string;
  tuyaUid: string;
  tuyaRegion: string;
}

export const EMPTY_CREDENTIALS: Credentials = {
  natureToken: "",
  switchbotToken: "",
  switchbotSecret: "",
  tuyaAccessId: "",
  tuyaSecret: "",
  tuyaUid: "",
  tuyaRegion: "us",
};

export interface DeviceCommand {
  id: string;
  on?: boolean;
  brightness?: number;
  targetTemp?: number;
  targetHumidity?: number;
  mode?: AcMode;
  position?: number;
}

export const BRAND_LABEL: Record<Brand, string> = {
  nature: "Nature Remo",
  switchbot: "SwitchBot",
  smartlife: "Smart Life",
  alexa: "Alexa",
  odelec: "オーデリック",
  daikin: "ダイキン",
};

export const CONNECTOR_LABEL: Record<Brand | "demo", string> = {
  nature: "Nature Remo",
  switchbot: "SwitchBot",
  smartlife: "Smart Life",
  alexa: "Alexa",
  odelec: "オーデリック",
  daikin: "ダイキン",
  demo: "デモ",
};

export function sourceLabel(device: { connector: Brand | "demo"; brand: Brand; source: DeviceSource }) {
  if (device.source === "live") return CONNECTOR_LABEL[device.connector];
  return BRAND_LABEL[device.brand];
}

export function connectorBadge(device: { connector: Brand | "demo" }) {
  return CONNECTOR_LABEL[device.connector];
}

/** 下部から接続先を外す。バッジ側に出す。 */
export function stripConnectorFromExtra(
  extra: string | undefined,
  connector: Brand | "demo",
) {
  const dest = CONNECTOR_LABEL[connector];
  const value = extra?.trim() ?? "";
  if (!value || value === dest) return "";
  if (value.startsWith(`${dest} · `)) return value.slice(dest.length + 3);
  return value;
}

/** 除湿で選べる目標湿度。0 は「連続」（50% 未満の設定は存在しない・実機観測）。 */
export const DRY_HUMIDITY_CHOICES = [0, 50, 55, 60];

/** 加湿で選べる目標湿度。0 は「連続」（リモコンは 40・45・50・連続の4択・実機観測）。 */
export const HUMIDIFY_HUMIDITY_CHOICES = [0, 40, 45, 50];

export const AC_MODE_LABEL: Record<AcMode, string> = {
  cool: "冷房",
  heat: "暖房",
  dry: "除湿",
  fan: "送風",
  auto: "自動",
  humidify: "加湿",
};

export const KIND_LABEL: Record<DeviceKind, string> = {
  light: "照明",
  ac: "エアコン",
  plug: "コンセント",
  curtain: "カーテン",
  bot: "ボット",
  sensor: "センサー",
  ir: "リモコン",
  lock: "鍵",
  other: "その他",
};

export interface DeviceOverride {
  name?: string;
  room?: string;
}

export type AutoTriggerType = "time" | "device" | "scene" | "sensor";
export type TimeRepeat = "daily" | "interval" | "weekly";
export type SensorMetric = "temperature" | "humidity" | "lux";
export type CompareOp = "gte" | "lte";

export interface AutoTrigger {
  type: AutoTriggerType;
  repeat?: TimeRepeat;
  hour?: number;
  minute?: number;
  everyHours?: number;
  days?: number[];
  deviceId?: string;
  deviceOn?: boolean;
  sceneId?: string;
  metric?: SensorMetric;
  op?: CompareOp;
  value?: number;
}

export interface AutoAction {
  id: string;
  deviceId?: string;
  on?: boolean;
  brightness?: number;
  targetTemp?: number;
  mode?: AcMode;
  position?: number;
}

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutoTrigger;
  actions: AutoAction[];
  lastFiredKey?: string;
}

export const DEFAULT_ROOMS = ["リビング", "寝室", "玄関", "その他"];

export function newActionId() {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const WEEKDAYS = [
  { id: 0, label: "日" },
  { id: 1, label: "月" },
  { id: 2, label: "火" },
  { id: 3, label: "水" },
  { id: 4, label: "木" },
  { id: 5, label: "金" },
  { id: 6, label: "土" },
] as const;

export const METRIC_LABEL: Record<SensorMetric, string> = {
  temperature: "気温",
  humidity: "湿度",
  lux: "照度",
};

export function migrateAutomation(raw: unknown): Automation | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (!a.id) return null;
  const trigger = (a.trigger as AutoTrigger | undefined) ?? {
    type: "time" as const,
    repeat: "daily" as const,
    hour: typeof a.hour === "number" ? a.hour : 7,
    minute: typeof a.minute === "number" ? a.minute : 0,
  };
  if (trigger.type === "time" && !trigger.repeat) trigger.repeat = "daily";
  const rawActions = (Array.isArray(a.actions) ? a.actions : []) as Array<AutoAction & { type?: string; sceneId?: string }>;
  const actions = rawActions
    .filter((x) => x && x.type !== "scene")
    .map((x) => ({
      id: x.id || newActionId(),
      deviceId: x.deviceId,
      on: x.on,
      brightness: x.brightness,
      targetTemp: x.targetTemp,
      mode: x.mode,
      position: x.position,
    }));
  return {
    id: String(a.id),
    name: String(a.name ?? "オートメーション"),
    enabled: Boolean(a.enabled),
    trigger,
    actions,
    lastFiredKey: typeof a.lastFiredKey === "string" ? a.lastFiredKey : undefined,
  };
}
