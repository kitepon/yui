import { toast } from "sonner";
import { clockInTokyo } from "./clock";
import { describePatch, patchFromAction, skipHeldRepeat } from "./device-patch";
import { runCommand } from "./run";
import { useHome } from "./store";
import { collectMatchingAutomations, prioritizeAutomationActions, sensorCondition, skipContinuousActions } from "./automation-priority";
import type { AutoAction, Automation } from "./types";
import { METRIC_LABEL, WEEKDAYS, sensorTempLabel } from "./types";

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
    const metric =
      device?.extra === "水温" ? sensorTempLabel(device) : METRIC_LABEL[t.metric ?? "temperature"];
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
    if (onlyIfDifferent && skipHeldRepeat(device, patch)) continue;
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
    if (sent > 0) useHome.getState().markLastRanAutomation(auto.id);
    if (!onlyIfDifferent || sent > 0) toast.message(auto.name);
  } finally {
    depth -= 1;
  }
}

function fireWave(firing: Automation[], holds: Set<string>) {
  const lastRan = useHome.getState().lastRanAutomationId;
  const planned = prioritizeAutomationActions(firing);
  for (const auto of firing) {
    const actions = planned.get(auto.id) ?? [];
    if (!actions.length) continue;
    const holding = holds.has(auto.id);
    const current = useHome.getState().automations.find((a) => a.id === auto.id) ?? auto;
    if (skipContinuousActions(current, lastRan)) continue;
    void executeAutomation({ ...current, actions }, { onlyIfDifferent: holding });
  }
}

export function fireScheduledAutomations() {
  const now = clockInTokyo();
  const nowMs = Date.now();
  const { automations, devices, climate, markAutomationFired } = useHome.getState();
  const holds = new Set<string>();
  const firing = collectMatchingAutomations(automations, (auto) => {
    if (auto.trigger.type === "time") {
      const t = auto.trigger;
      const repeat = t.repeat ?? "daily";
      if (repeat === "interval") {
        const ms = Math.max(1, t.everyHours ?? 1) * 60 * 60 * 1000;
        const last = Number(auto.lastFiredKey ?? 0);
        if (last && nowMs - last < ms) return false;
        markAutomationFired(auto.id, String(nowMs));
        return true;
      }
      if ((t.hour ?? 0) !== now.hour || (t.minute ?? 0) !== now.minute) return false;
      if (repeat === "weekly" && !(t.days ?? []).includes(now.weekday)) return false;
      const key = `${now.dayKey}-${now.hour}-${now.minute}`;
      if (auto.lastFiredKey === key) return false;
      markAutomationFired(auto.id, key);
      return true;
    }
    if (auto.trigger.type !== "sensor") return false;
    const d = sensorCondition(auto, { devices, climate });
    if (d.key) markAutomationFired(auto.id, d.key);
    if (d.match && d.holds) holds.add(auto.id);
    return d.match;
  });
  fireWave(firing, holds);
}

export function fireTimeAutomations() {
  fireScheduledAutomations();
}

export function fireDeviceAutomations(deviceId: string, on?: boolean) {
  if (on === undefined) return;
  const { automations } = useHome.getState();
  const firing = collectMatchingAutomations(automations, (auto) => {
    if (auto.trigger.type !== "device") return false;
    if (auto.trigger.deviceId !== deviceId) return false;
    if (auto.trigger.deviceOn !== undefined && auto.trigger.deviceOn !== on) return false;
    return true;
  });
  fireWave(firing, new Set());
}

export function fireSceneAutomations(sceneId: string) {
  const { automations } = useHome.getState();
  fireWave(
    collectMatchingAutomations(
      automations,
      (auto) => auto.trigger.type === "scene" && auto.trigger.sceneId === sceneId,
    ),
    new Set(),
  );
}

export function fireSensorAutomations() {
  fireScheduledAutomations();
}
