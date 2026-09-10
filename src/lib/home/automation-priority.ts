import type { AutoAction, Automation, AutoTrigger } from "./types.ts";
import { metricValue, sensorHoldsWhileInRange, sensorTriggerDecision } from "./sensor-trigger.ts";

/**
 * 一覧の上が同じ機器を取る。下は残った機器だけ動かす。
 * `firing` は条件を満たしたオートメーションを、欄の並びのまま渡す。
 */
export function prioritizeAutomationActions(firing: Automation[]): Map<string, AutoAction[]> {
  const claimed = new Set<string>();
  const out = new Map<string, AutoAction[]>();
  for (const auto of firing) {
    const run: AutoAction[] = [];
    for (const action of auto.actions) {
      const id = action.deviceId;
      if (!id) continue;
      if (!claimed.has(id)) run.push(action);
      claimed.add(id);
    }
    out.set(auto.id, run);
  }
  return out;
}

/**
 * センサー条件をいま満たしているか。以上・以下は一度送ったあとも、
 * 満たしているあいだは機器を取り続ける（下が奪わない）。
 */
export function sensorCondition(auto: Automation, snap: {
  devices: Array<{
    id: string;
    temperature?: number | null;
    humidity?: number | null;
    lux?: number | null;
    outdoorTemp?: number | null;
  }>;
  climate: { temperature?: number | null; humidity?: number | null; lux?: number | null };
}): { match: boolean; holds: boolean; key?: string } {
  if (!auto.enabled || auto.trigger.type !== "sensor") return { match: false, holds: false };
  const t = auto.trigger as AutoTrigger;
  const metric = t.metric ?? "temperature";
  const device = snap.devices.find((d) => d.id === t.deviceId);
  const raw = device ? metricValue(device, metric) : metricValue(snap.climate, metric);
  if (raw == null || t.value == null) return { match: false, holds: false };
  if (sensorHoldsWhileInRange(t) && t.valueMax == null) return { match: false, holds: false };
  const { pass, key } = sensorTriggerDecision(raw, t);
  if (!pass) {
    if (sensorHoldsWhileInRange(t)) return { match: false, holds: false };
    if (auto.lastFiredKey === key) return { match: false, holds: false };
    return { match: false, holds: false, key };
  }
  if (sensorHoldsWhileInRange(t)) return { match: true, holds: true };
  if (auto.lastFiredKey === key) return { match: true, holds: true };
  return { match: true, holds: false, key };
}
