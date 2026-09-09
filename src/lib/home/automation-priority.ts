import type { AutoAction, Automation } from "./types";

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
