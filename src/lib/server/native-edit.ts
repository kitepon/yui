import { z } from "zod";
import { matchesStep } from "../home/demo.ts";
import { fillVisibleDefaults, reportsActuatorState } from "../home/device-patch.ts";
import type { HomeSnapshot } from "../home/snapshot.ts";
import { completeTrigger, isSensorSource, sensorMetricsOf, type AutoAction, type AutoTrigger, type SceneStep } from "../home/types.ts";

const patchFields = {
  on: z.boolean().optional(),
  brightness: z.number().finite().optional(),
  targetTemp: z.number().finite().optional(),
  targetHumidity: z.number().finite().optional(),
  fanSpeed: z.enum(["auto", "quiet", "1", "2", "3", "4", "5"]).optional(),
  fanSwing: z.enum(["auto", "off", "vertical", "horizontal", "both"]).optional(),
  mode: z.enum(["cool", "heat", "dry", "fan", "auto", "humidify"]).optional(),
  position: z.number().finite().optional(),
};

const patchSchema = z.strictObject(patchFields).refine((patch) => Object.values(patch).some((value) => value !== undefined));
const sceneStepSchema = z.strictObject({
  match: z.strictObject({
    id: z.string().min(1).optional(),
    room: z.string().min(1).optional(),
    kind: z.enum(["light", "ac", "plug", "curtain", "bot", "sensor", "ir", "lock", "other"]).optional(),
    brand: z.enum(["nature", "switchbot", "smartlife", "alexa", "odelec", "daikin"]).optional(),
  }).refine((match) => Object.values(match).some(Boolean)),
  patch: patchSchema,
});

const triggerSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("time"),
    repeat: z.enum(["daily", "interval", "weekly"]).optional(),
    hour: z.number().int().min(0).max(23).optional(),
    minute: z.number().int().min(0).max(59).optional(),
    everyHours: z.number().int().min(1).max(24).optional(),
    days: z.array(z.number().int().min(0).max(6)).optional(),
  }),
  z.strictObject({ type: z.literal("device"), deviceId: z.string().min(1), deviceOn: z.boolean().optional() }),
  z.strictObject({ type: z.literal("scene"), sceneId: z.string().min(1) }),
  z.strictObject({
    type: z.literal("sensor"), deviceId: z.string().min(1),
    metric: z.enum(["temperature", "humidity", "lux", "outdoorTemp"]),
    op: z.enum(["gte", "lte", "between"]),
    value: z.number().finite(), valueMax: z.number().finite().optional(),
  }),
]);

const automationSchema = z.strictObject({
  name: z.string().trim().min(1),
  enabled: z.boolean(),
  stopOnMatch: z.boolean().optional(),
  trigger: triggerSchema,
  actions: z.array(z.strictObject({
    id: z.string().min(1), deviceId: z.string().min(1),
    ...patchFields,
    skipContinuous: z.boolean().optional(),
  })).min(1),
});

function activeDevices(snap: HomeSnapshot) {
  const live = snap.devices.filter((device) => device.source === "live");
  return live.length ? live : snap.devices;
}

export function parseNativeSceneSteps(input: unknown, snap: HomeSnapshot, previous: SceneStep[] = []): SceneStep[] | null {
  const parsed = z.array(sceneStepSchema).safeParse(input);
  if (!parsed.success) return null;
  const steps: SceneStep[] = parsed.data;
  if (!steps.every((step) =>
    activeDevices(snap).some((device) => matchesStep(device, step)) ||
    previous.some((old) =>
      ["id", "room", "kind", "brand"].every((key) => old.match[key as keyof typeof old.match] === step.match[key as keyof typeof step.match]) &&
      Object.keys(patchFields).every((key) => old.patch[key as keyof typeof old.patch] === step.patch[key as keyof typeof step.patch]),
    )
  )) return null;
  return steps.map((step) => {
    const device = step.match.id ? activeDevices(snap).find((item) => item.id === step.match.id) : undefined;
    return device ? { ...step, patch: fillVisibleDefaults(device, step.patch) } : step;
  });
}

export function parseNativeAutomation(input: unknown, snap: HomeSnapshot) {
  const parsed = automationSchema.safeParse(input);
  if (!parsed.success) return null;
  const draft = parsed.data;
  const trigger: AutoTrigger = completeTrigger(draft.trigger);
  if (trigger.type === "device" && !snap.devices.some((device) => device.id === trigger.deviceId && device.kind !== "sensor")) return null;
  if (trigger.type === "scene" && !snap.scenes.some((scene) => scene.id === trigger.sceneId)) return null;
  if (trigger.type === "sensor") {
    const device = snap.devices.find((item) => item.id === trigger.deviceId);
    if (!device || !isSensorSource(device) || !sensorMetricsOf(device).includes(trigger.metric ?? "temperature")) return null;
    if (trigger.op === "between" && (trigger.valueMax == null || trigger.value == null || trigger.value > trigger.valueMax)) return null;
  }
  if (trigger.type === "time" && trigger.repeat === "weekly" && !trigger.days?.length) return null;
  const actions: AutoAction[] = [];
  for (const action of draft.actions) {
    const device = activeDevices(snap).find((item) => item.id === action.deviceId && item.kind !== "sensor");
    if (!device || trigger.type === "sensor" && trigger.op === "between" && !reportsActuatorState(device)) return null;
    actions.push(fillVisibleDefaults(device, action));
  }
  return { name: draft.name, enabled: draft.enabled, stopOnMatch: draft.stopOnMatch, trigger, actions };
}
