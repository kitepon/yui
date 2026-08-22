import type { AcMode, Device, DeviceKind, Scene } from "@/lib/home/types";

export type AlexaDirective = {
  header: {
    namespace: string;
    name: string;
    messageId: string;
    payloadVersion?: string;
    correlationToken?: string;
  };
  endpoint?: {
    endpointId: string;
    scope?: { type?: string; token?: string };
    cookie?: Record<string, string>;
  };
  payload?: Record<string, unknown> & {
    scope?: { type?: string; token?: string };
    grantee?: { type?: string; token?: string };
    brightness?: number;
    brightnessDelta?: number;
    rangeValue?: number;
    rangeValueDelta?: number;
    percentage?: number;
    percentageDelta?: number;
    lockState?: string;
  };
};

export type AlexaEvent = { directive: AlexaDirective };

export type AlexaIntent =
  | { type: "acceptGrant" }
  | { type: "discover" }
  | { type: "report" }
  | { type: "power"; on: boolean }
  | { type: "brightness"; value: number }
  | { type: "brightnessDelta"; delta: number }
  | { type: "position"; value: number }
  | { type: "positionDelta"; delta: number }
  | { type: "lock"; locked: boolean }
  | { type: "thermostat"; mode?: AcMode | "off"; targetTemp?: number; deltaTemp?: number }
  | { type: "scene" };

const POWER_KINDS = new Set<DeviceKind>(["light", "plug", "bot", "ir", "ac", "lock"]);

function payloadNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "value" in value) {
    const n = Number((value as { value: unknown }).value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function payloadScale(value: unknown) {
  if (value && typeof value === "object" && "scale" in value) {
    return String((value as { scale: unknown }).scale).toUpperCase();
  }
  return "CELSIUS";
}

function celsiusOf(value: unknown): number | null {
  const n = payloadNumber(value);
  if (n == null) return null;
  if (payloadScale(value) === "FAHRENHEIT") return Math.round(((n - 32) * 5) / 9);
  return n;
}

function thermostatModeOf(value: unknown): AcMode | "off" | null {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "value" in value
        ? String((value as { value: unknown }).value)
        : "";
  const mode = raw.trim().toUpperCase();
  if (mode === "HEAT") return "heat";
  if (mode === "COOL") return "cool";
  if (mode === "AUTO" || mode === "ECO") return "auto";
  if (mode === "OFF") return "off";
  return null;
}

export function clampAlexa(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function alexaToken(event: AlexaEvent): string | null {
  const d = event.directive;
  return (
    d.endpoint?.scope?.token?.trim() ||
    d.payload?.scope?.token?.trim() ||
    d.payload?.grantee?.token?.trim() ||
    null
  );
}

export function parseAlexaIntent(d: AlexaDirective): AlexaIntent | { error: string } {
  const ns = d.header.namespace;
  const name = d.header.name;
  const payload = d.payload;
  if (ns === "Alexa.Authorization" && name === "AcceptGrant") return { type: "acceptGrant" };
  if (ns === "Alexa.Discovery" && name === "Discover") return { type: "discover" };
  if (ns === "Alexa" && name === "ReportState") return { type: "report" };
  if (ns === "Alexa.PowerController" && name === "TurnOn") return { type: "power", on: true };
  if (ns === "Alexa.PowerController" && name === "TurnOff") return { type: "power", on: false };
  if (ns === "Alexa.BrightnessController" && name === "SetBrightness") {
    const value = payloadNumber(payload?.brightness);
    if (value == null) return { error: "明るさが不正です" };
    return { type: "brightness", value };
  }
  if (ns === "Alexa.BrightnessController" && name === "AdjustBrightness") {
    const delta = payloadNumber(payload?.brightnessDelta);
    if (delta == null) return { error: "明るさが不正です" };
    return { type: "brightnessDelta", delta };
  }
  if (ns === "Alexa.RangeController" && name === "SetRangeValue") {
    const value = payloadNumber(payload?.rangeValue);
    if (value == null) return { error: "開度が不正です" };
    return { type: "position", value };
  }
  if (ns === "Alexa.RangeController" && name === "AdjustRangeValue") {
    const delta = payloadNumber(payload?.rangeValueDelta);
    if (delta == null) return { error: "開度が不正です" };
    return { type: "positionDelta", delta };
  }
  if (ns === "Alexa.PercentageController" && name === "SetPercentage") {
    const value = payloadNumber(payload?.percentage);
    if (value == null) return { error: "開度が不正です" };
    return { type: "position", value };
  }
  if (ns === "Alexa.PercentageController" && name === "AdjustPercentage") {
    const delta = payloadNumber(payload?.percentageDelta);
    if (delta == null) return { error: "開度が不正です" };
    return { type: "positionDelta", delta };
  }
  if (ns === "Alexa.LockController" && name === "Lock") return { type: "lock", locked: true };
  if (ns === "Alexa.LockController" && name === "Unlock") return { type: "lock", locked: false };
  if (ns === "Alexa.ThermostatController" && name === "SetTargetTemperature") {
    const targetTemp = celsiusOf(payload?.targetSetpoint);
    if (targetTemp == null) return { error: "温度が不正です" };
    return { type: "thermostat", targetTemp };
  }
  if (ns === "Alexa.ThermostatController" && name === "AdjustTargetTemperature") {
    const deltaTemp = celsiusOf(payload?.targetSetpointDelta);
    if (deltaTemp == null) return { error: "温度が不正です" };
    return { type: "thermostat", deltaTemp };
  }
  if (ns === "Alexa.ThermostatController" && name === "SetThermostatMode") {
    const mode = thermostatModeOf(payload?.thermostatMode);
    if (!mode) return { error: "運転モードが不正です" };
    return { type: "thermostat", mode };
  }
  if (ns === "Alexa.SceneController" && (name === "Activate" || name === "Deactivate")) {
    return { type: "scene" };
  }
  return { error: `${ns}/${name} は未対応です` };
}

export function patchFromIntent(device: Device, intent: AlexaIntent): Partial<Device> | { error: string } {
  if (intent.type === "power") return { on: intent.on };
  if (intent.type === "brightness") {
    const brightness = clampAlexa(intent.value, 0, 100);
    return { brightness, on: brightness > 0 };
  }
  if (intent.type === "brightnessDelta") {
    const brightness = clampAlexa((device.brightness ?? 100) + intent.delta, 0, 100);
    return { brightness, on: brightness > 0 };
  }
  if (intent.type === "position") return { position: clampAlexa(intent.value, 0, 100) };
  if (intent.type === "positionDelta") {
    return { position: clampAlexa((device.position ?? 0) + intent.delta, 0, 100) };
  }
  if (intent.type === "lock") return { on: intent.locked };
  if (intent.type === "thermostat") {
    if (intent.mode === "off") return { on: false };
    const patch: Partial<Device> = {};
    if (intent.mode) {
      patch.mode = intent.mode;
      patch.on = true;
    }
    if (intent.deltaTemp != null) {
      patch.targetTemp = clampAlexa((device.targetTemp ?? 26) + intent.deltaTemp, 16, 32);
      patch.on = true;
    }
    if (intent.targetTemp != null) {
      patch.targetTemp = clampAlexa(intent.targetTemp, 16, 32);
      patch.on = true;
    }
    return patch;
  }
  return { error: "この機器ではできません" };
}

export function isSceneEndpoint(endpointId: string) {
  return endpointId.startsWith("scene:");
}

export function sceneIdFromEndpoint(endpointId: string) {
  return endpointId.slice("scene:".length);
}

export function deviceDiscoverable(device: Device) {
  if (device.source !== "live") return false;
  if (device.kind === "sensor" || device.kind === "other") return false;
  return POWER_KINDS.has(device.kind) || device.kind === "curtain";
}

function displayCategory(kind: DeviceKind): string {
  if (kind === "light") return "LIGHT";
  if (kind === "plug") return "SMARTPLUG";
  if (kind === "curtain") return "INTERIOR_BLIND";
  if (kind === "ac") return "THERMOSTAT";
  if (kind === "lock") return "SMARTLOCK";
  return "SWITCH";
}

const HEALTH = {
  type: "AlexaInterface",
  interface: "Alexa.EndpointHealth",
  version: "3",
  properties: { supported: [{ name: "connectivity" }], proactivelyReported: false, retrievable: true },
};

function capabilities(device: Device): object[] {
  const alexa = { type: "AlexaInterface", interface: "Alexa", version: "3" };
  const power = {
    type: "AlexaInterface",
    interface: "Alexa.PowerController",
    version: "3",
    properties: { supported: [{ name: "powerState" }], proactivelyReported: false, retrievable: true },
  };
  const brightness = {
    type: "AlexaInterface",
    interface: "Alexa.BrightnessController",
    version: "3",
    properties: { supported: [{ name: "brightness" }], proactivelyReported: false, retrievable: true },
  };
  const range = {
    type: "AlexaInterface",
    interface: "Alexa.RangeController",
    version: "3",
    instance: "Blind.Lift",
    capabilityResources: { friendlyNames: [{ "@type": "text", value: { text: "開度", locale: "ja-JP" } }] },
    properties: { supported: [{ name: "rangeValue" }], proactivelyReported: false, retrievable: true },
    configuration: { supportedRange: { minimumValue: 0, maximumValue: 100, precision: 1 } },
    semantics: {
      actionMappings: [
        {
          "@type": "ActionsToDirective",
          actions: ["Alexa.Actions.Close"],
          directive: { name: "SetRangeValue", payload: { rangeValue: 0 } },
        },
        {
          "@type": "ActionsToDirective",
          actions: ["Alexa.Actions.Open"],
          directive: { name: "SetRangeValue", payload: { rangeValue: 100 } },
        },
      ],
      stateMappings: [
        { "@type": "StatesToValue", states: ["Alexa.States.Closed"], value: 0 },
        {
          "@type": "StatesToRange",
          states: ["Alexa.States.Open"],
          range: { minimumValue: 1, maximumValue: 100 },
        },
      ],
    },
  };
  const lock = {
    type: "AlexaInterface",
    interface: "Alexa.LockController",
    version: "3",
    properties: { supported: [{ name: "lockState" }], proactivelyReported: false, retrievable: true },
  };
  const thermostat = {
    type: "AlexaInterface",
    interface: "Alexa.ThermostatController",
    version: "3",
    properties: {
      supported: [{ name: "targetSetpoint" }, { name: "thermostatMode" }],
      proactivelyReported: false,
      retrievable: true,
    },
    configuration: { supportedModes: ["HEAT", "COOL", "AUTO", "OFF"] },
  };
  const list = [alexa, HEALTH];
  if (device.kind === "curtain") list.push(range);
  else if (device.kind === "lock") list.push(lock);
  else list.push(power);
  if (device.kind === "light") list.push(brightness);
  if (device.kind === "ac") list.push(thermostat);
  return list;
}

function alexaThermostatMode(device: Device) {
  if (device.on === false) return "OFF";
  if (device.mode === "heat") return "HEAT";
  if (device.mode === "cool") return "COOL";
  return "AUTO";
}

export function discoverEndpoints(devices: Device[], scenes: Scene[]) {
  const endpoints = devices.filter(deviceDiscoverable).map((device) => ({
    endpointId: device.id,
    manufacturerName: "結",
    friendlyName: device.name,
    description: `${device.room} · ${device.kind}`,
    displayCategories: [displayCategory(device.kind)],
    cookie: {},
    capabilities: capabilities(device),
  }));
  for (const scene of scenes) {
    endpoints.push({
      endpointId: `scene:${scene.id}`,
      manufacturerName: "結",
      friendlyName: scene.name,
      description: scene.hint || "結の場面",
      displayCategories: ["SCENE_TRIGGER"],
      cookie: {},
      capabilities: [
        { type: "AlexaInterface", interface: "Alexa", version: "3" },
        {
          type: "AlexaInterface",
          interface: "Alexa.SceneController",
          version: "3",
          supportsDeactivation: false,
        },
      ],
    });
  }
  return endpoints;
}

export function propertyContext(device: Device) {
  const now = new Date().toISOString();
  const props: Array<Record<string, unknown>> = [];
  if (device.kind === "curtain") {
    props.push({
      namespace: "Alexa.RangeController",
      instance: "Blind.Lift",
      name: "rangeValue",
      value: device.position ?? 0,
      timeOfSample: now,
      uncertaintyInMilliseconds: 0,
    });
  } else if (device.kind === "lock") {
    props.push({
      namespace: "Alexa.LockController",
      name: "lockState",
      value: device.on ? "LOCKED" : "UNLOCKED",
      timeOfSample: now,
      uncertaintyInMilliseconds: 0,
    });
  } else {
    props.push({
      namespace: "Alexa.PowerController",
      name: "powerState",
      value: device.on ? "ON" : "OFF",
      timeOfSample: now,
      uncertaintyInMilliseconds: 0,
    });
  }
  if (device.kind === "light") {
    props.push({
      namespace: "Alexa.BrightnessController",
      name: "brightness",
      value: device.brightness ?? 100,
      timeOfSample: now,
      uncertaintyInMilliseconds: 0,
    });
  }
  if (device.kind === "ac") {
    props.push({
      namespace: "Alexa.ThermostatController",
      name: "targetSetpoint",
      value: { value: device.targetTemp ?? 26, scale: "CELSIUS" },
      timeOfSample: now,
      uncertaintyInMilliseconds: 0,
    });
    props.push({
      namespace: "Alexa.ThermostatController",
      name: "thermostatMode",
      value: alexaThermostatMode(device),
      timeOfSample: now,
      uncertaintyInMilliseconds: 0,
    });
  }
  props.push({
    namespace: "Alexa.EndpointHealth",
    name: "connectivity",
    value: { value: device.online ? "OK" : "UNREACHABLE" },
    timeOfSample: now,
    uncertaintyInMilliseconds: 0,
  });
  return props;
}

export function acceptGrantResponse(directive: AlexaDirective) {
  return {
    event: {
      header: {
        namespace: "Alexa.Authorization",
        name: "AcceptGrant.Response",
        payloadVersion: "3",
        messageId: `${directive.header.messageId}-res`,
      },
      payload: {},
    },
  };
}

export function alexaOk(directive: AlexaDirective, extra: Record<string, unknown> = {}) {
  return {
    event: {
      header: {
        namespace: extra.namespace ?? "Alexa",
        name: extra.name ?? "Response",
        messageId: `${directive.header.messageId}-res`,
        correlationToken: directive.header.correlationToken,
        payloadVersion: "3",
      },
      endpoint: directive.endpoint
        ? { endpointId: directive.endpoint.endpointId }
        : undefined,
      payload: extra.payload ?? {},
    },
    context: extra.context,
  };
}

export function alexaError(directive: AlexaDirective, type: string, message: string) {
  return {
    event: {
      header: {
        namespace: "Alexa",
        name: "ErrorResponse",
        messageId: `${directive.header.messageId}-err`,
        correlationToken: directive.header.correlationToken,
        payloadVersion: "3",
      },
      endpoint: directive.endpoint ? { endpointId: directive.endpoint.endpointId } : undefined,
      payload: { type, message },
    },
  };
}

export function discoverResponse(directive: AlexaDirective, endpoints: ReturnType<typeof discoverEndpoints>) {
  return {
    event: {
      header: {
        namespace: "Alexa.Discovery",
        name: "Discover.Response",
        payloadVersion: "3",
        messageId: `${directive.header.messageId}-res`,
      },
      payload: { endpoints },
    },
  };
}

export function allowedAlexaRedirect(uri: string) {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname;
  return (
    host === "alexa.amazon.co.jp" ||
    host === "pitangui.amazon.com" ||
    host === "layla.amazon.com" ||
    host === "alexa.amazon.com"
  );
}
