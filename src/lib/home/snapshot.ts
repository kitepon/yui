import { DEMO_CLIMATE, DEMO_DEVICES, SCENES } from "./demo";
import {
  DEFAULT_ROOMS,
  EMPTY_CREDENTIALS,
  type Automation,
  type Brand,
  type Climate,
  type ConnectorStatus,
  type Credentials,
  type Device,
  type DeviceOverride,
  type Scene,
} from "./types";

export interface HomeSnapshot {
  credentials: Credentials;
  devices: Device[];
  climate: Climate;
  connectors: Record<Brand, ConnectorStatus>;
  rooms: string[];
  overrides: Record<string, DeviceOverride>;
  deviceOrder: Record<string, string[]>;
  scenes: Scene[];
  automations: Automation[];
  lastScene: string | null;
  savedAt: string | null;
  pairPin: string;
  host?: string;
  credentialFlags?: Record<keyof Credentials, boolean>;
  /** オーデリックのブリッジが設定されているか。自宅の image だけ true。 */
  odelicBridge?: boolean;
  /** ダイキン直結の宛先が設定されているか。自宅の image だけ true。 */
  daikinDirect?: boolean;
}

export function emptyConnectors(): Record<Brand, ConnectorStatus> {
  return {
    nature: { id: "nature", connected: false, deviceCount: 0 },
    switchbot: { id: "switchbot", connected: false, deviceCount: 0 },
    smartlife: { id: "smartlife", connected: false, deviceCount: 0 },
    alexa: { id: "alexa", connected: false, deviceCount: 0 },
    odelec: { id: "odelec", connected: false, deviceCount: 0 },
    daikin: { id: "daikin", connected: false, deviceCount: 0 },
  };
}

export function emptySnapshot(): HomeSnapshot {
  return {
    credentials: { ...EMPTY_CREDENTIALS },
    devices: DEMO_DEVICES,
    climate: DEMO_CLIMATE,
    connectors: emptyConnectors(),
    rooms: [...DEFAULT_ROOMS],
    overrides: {},
    deviceOrder: {},
    scenes: SCENES,
    automations: [],
    lastScene: null,
    savedAt: null,
    pairPin: "",
  };
}
