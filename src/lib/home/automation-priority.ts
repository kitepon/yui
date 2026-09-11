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
 * 「連続では動かさない」は、直前に実際に動いたのが同じオートメーションのときだけ止める。
 * 条件が続いているだけでは連続ではない。別のオートメーションが動いたあとは止めるな。
 */
export function skipContinuousActions(auto: Automation, lastRanAutomationId: string | null | undefined) {
  return Boolean(auto.skipContinuous && lastRanAutomationId && lastRanAutomationId === auto.id);
}

/**
 * センサー条件をいま満たしているか。満たしているあいだは機器を取り続ける（下が奪わない）。
 * 範囲に入った最初は送り、入っているあいだは保持する。出たら fail を残して、再入場でまた送る。
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
    if (sensorHoldsWhileInRange(t)) return { match: false, holds: false, key };
    if (auto.lastFiredKey === key) return { match: false, holds: false };
    return { match: false, holds: false, key };
  }
  if (auto.lastFiredKey === key) return { match: true, holds: true };
  return { match: true, holds: false, key };
}
