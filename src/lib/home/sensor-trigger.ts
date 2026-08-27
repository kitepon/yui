import type { AutoTrigger } from "./types";

export function sensorOp(trigger: AutoTrigger) {
  if (trigger.op === "lte") return "lte";
  if (trigger.op === "between") return "between";
  return "gte";
}

/** 範囲内のあいだ、毎周期いまの設定と比べて違うときだけ送る。 */
export function sensorHoldsWhileInRange(trigger: AutoTrigger) {
  return sensorOp(trigger) === "between";
}

/** 条件をキーに含める。しきい値や向きを変えたあとに、古い pass で黙らないようにする。 */
export function sensorTriggerDecision(raw: number, trigger: AutoTrigger): { pass: boolean; key: string } {
  const metric = trigger.metric ?? "temperature";
  const op = sensorOp(trigger);
  const lo = trigger.value;
  const hi = trigger.valueMax;
  let pass: boolean;
  if (op === "between") {
    const min = Math.min(lo ?? 0, hi ?? lo ?? 0);
    const max = Math.max(lo ?? 0, hi ?? lo ?? 0);
    pass = raw >= min && raw <= max;
  } else if (op === "lte") {
    pass = raw <= (lo ?? 0);
  } else {
    pass = raw >= (lo ?? 0);
  }
  const key = `${trigger.deviceId ?? "climate"}:${metric}:${op}:${lo}:${hi ?? ""}:${pass ? "pass" : "fail"}`;
  return { pass, key };
}
