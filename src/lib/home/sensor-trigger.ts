import type { AutoTrigger } from "./types";

/** 条件をキーに含める。しきい値や向きを変えたあとに、古い pass で黙らないようにする。 */
export function sensorTriggerDecision(raw: number, trigger: AutoTrigger): { pass: boolean; key: string } {
  const metric = trigger.metric ?? "temperature";
  const op = trigger.op === "lte" ? "lte" : "gte";
  const value = trigger.value;
  const pass = op === "lte" ? raw <= (value ?? 0) : raw >= (value ?? 0);
  const key = `${trigger.deviceId ?? "climate"}:${metric}:${op}:${value}:${pass ? "pass" : "fail"}`;
  return { pass, key };
}
