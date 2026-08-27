import { toast } from "sonner";
import { clockInTokyo } from "./clock";
import { describePatch, patchAlreadyApplied, patchFromAction, reportsActuatorState } from "./device-patch";
import { runCommand } from "./run";
import { useHome } from "./store";
import { sensorHoldsWhileInRange, sensorTriggerDecision } from "./sensor-trigger";
import type { AutoAction, Automation, SensorMetric } from "./types";
import { METRIC_LABEL, WEEKDAYS } from "./types";

let depth = 0;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function describeTrigger(auto: Automation) {
  const t = auto.trigger;
  if (t.type === "time") {
    if (t.repeat === "interval") return `${t.everyHours ?? 1}時間おき`;
    const hm = `${pad(t.hour ?? 0)}:${pad(t.minute ?? 0)}`;
    if (t.repeat === "weekly") {
      const days = (t.days ?? []).map((d) => WEEKDAYS.find((w) => w.id === d)?.label ?? "").join("");
      return `${days || "曜日"} ${hm}`;
    }
    return `毎日 ${hm}`;
  }
  if (t.type === "device") {
    const device = useHome.getState().devices.find((d) => d.id === t.deviceId);
    return `${device?.name ?? "機器"} が${t.deviceOn === false ? "切" : "入"}`;
  }
  if (t.type === "sensor") {
    const device = useHome.getState().devices.find((d) => d.id === t.deviceId);
    const metric = device?.extra === "水温" ? "水温" : METRIC_LABEL[t.metric ?? "temperature"];
    if (t.op === "between") {
      const lo = Math.min(t.value ?? 0, t.valueMax ?? t.value ?? 0);
      const hi = Math.max(t.value ?? 0, t.valueMax ?? t.value ?? 0);
      return `${device?.name ?? "センサー"} ${metric}${lo}〜${hi}の範囲`;
    }
    const op = t.op === "lte" ? "以下" : "以上";
    return `${device?.name ?? "センサー"} ${metric}${t.value ?? 0}${op}`;
  }
  const scene = useHome.getState().scenes.find((s) => s.id === t.sceneId);
  return `場面「${scene?.name ?? "—"}」`;
}

export function describeAction(action: AutoAction) {
  const device = useHome.getState().devices.find((d) => d.id === action.deviceId);
  return [device?.name ?? "機器", ...describePatch(action)].join(" ");
}

async function runActions(auto: Automation, onlyIfDifferent: boolean) {
  let sent = 0;
  for (const action of auto.actions) {
    if (!action.deviceId) continue;
    const device = useHome.getState().devices.find((d) => d.id === action.deviceId);
    if (!device) continue;
    const patch = patchFromAction(action);
    if (onlyIfDifferent) {
      if (!reportsActuatorState(device)) continue;
      if (patchAlreadyApplied(device, patch)) continue;
    }
    await runCommand(device, patch);
    sent += 1;
  }
  return sent;
}

export async function executeAutomation(auto: Automation, opts?: { onlyIfDifferent?: boolean }) {
  if (!auto.enabled || !auto.actions.length) return;
  if (depth > 2) return;
  depth += 1;
  try {
    const onlyIfDifferent = opts?.onlyIfDifferent === true;
    const sent = await runActions(auto, onlyIfDifferent);
    if (!onlyIfDifferent || sent > 0) toast.message(auto.name);
  } finally {
    depth -= 1;
  }
}

export function fireTimeAutomations() {
  const now = clockInTokyo();
  const today = now.dayKey;
  const hour = now.hour;
  const minute = now.minute;
  const weekday = now.weekday;
  const { automations, markAutomationFired } = useHome.getState();
  for (const auto of automations) {
    if (!auto.enabled || auto.trigger.type !== "time") continue;
    const t = auto.trigger;
    const repeat = t.repeat ?? "daily";

    if (repeat === "interval") {
      const ms = Math.max(1, t.everyHours ?? 1) * 60 * 60 * 1000;
      const last = Number(auto.lastFiredKey ?? 0);
      if (last && Date.now() - last < ms) continue;
      markAutomationFired(auto.id, String(Date.now()));
      void executeAutomation(auto);
      continue;
    }

    if ((t.hour ?? 0) !== hour || (t.minute ?? 0) !== minute) continue;
    if (repeat === "weekly") {
      const days = t.days ?? [];
      if (!days.includes(weekday)) continue;
    }
    const key = `${today}-${hour}-${minute}`;
    if (auto.lastFiredKey === key) continue;
    markAutomationFired(auto.id, key);
    void executeAutomation(auto);
  }
}

export function fireDeviceAutomations(deviceId: string, on?: boolean) {
  if (on === undefined) return;
  const { automations } = useHome.getState();
  for (const auto of automations) {
    if (!auto.enabled || auto.trigger.type !== "device") continue;
    if (auto.trigger.deviceId !== deviceId) continue;
    if (auto.trigger.deviceOn !== undefined && auto.trigger.deviceOn !== on) continue;
    void executeAutomation(auto);
  }
}

export function fireSceneAutomations(sceneId: string) {
  const { automations } = useHome.getState();
  for (const auto of automations) {
    if (!auto.enabled || auto.trigger.type !== "scene") continue;
    if (auto.trigger.sceneId !== sceneId) continue;
    void executeAutomation(auto);
  }
}

function metricValue(
  device: { temperature?: number | null; humidity?: number | null; lux?: number | null },
  metric: SensorMetric,
) {
  if (metric === "temperature") return device.temperature;
  if (metric === "humidity") return device.humidity;
  return device.lux;
}

export function fireSensorAutomations() {
  const { automations, devices, climate, markAutomationFired } = useHome.getState();
  for (const auto of automations) {
    if (!auto.enabled || auto.trigger.type !== "sensor") continue;
    const t = auto.trigger;
    const metric = t.metric ?? "temperature";
    const device = devices.find((d) => d.id === t.deviceId);
    const raw = device ? metricValue(device, metric) : metricValue(climate, metric);
    if (raw == null || t.value == null) continue;
    if (sensorHoldsWhileInRange(t) && t.valueMax == null) continue;
    const { pass, key } = sensorTriggerDecision(raw, t);
    if (sensorHoldsWhileInRange(t)) {
      if (pass) void executeAutomation(auto, { onlyIfDifferent: true });
      continue;
    }
    if (auto.lastFiredKey === key) continue;
    markAutomationFired(auto.id, key);
    if (pass) void executeAutomation(auto);
  }
}
