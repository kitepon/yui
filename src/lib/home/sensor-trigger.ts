import type { AutoTrigger, SensorMetric } from "./types";

export function metricValue(
  device: {
    temperature?: number | null;
    humidity?: number | null;
    lux?: number | null;
    outdoorTemp?: number | null;
  },
  metric: SensorMetric,
) {
  if (metric === "humidity") return device.humidity;
  if (metric === "lux") return device.lux;
  if (metric === "outdoorTemp") return device.outdoorTemp;
  return device.temperature;
}

export function sensorOp(trigger: AutoTrigger) {
  if (trigger.op === "lte") return "lte";
  if (trigger.op === "between") return "between";
  return "gte";
}

/** 範囲内のあいだ、毎周期いまの設定と比べて違うときだけ送る。 */
export function sensorHoldsWhileInRange(trigger: AutoTrigger) {
  return sensorOp(trigger) === "between";
}

/** 戻り幅。無い・0 以下・数でない値は 0（従来どおり）。 */
export function sensorHysteresis(trigger: AutoTrigger) {
  const h = trigger.hysteresis;
  return typeof h === "number" && Number.isFinite(h) && h > 0 ? h : 0;
}

/** 条件をキーに含める。しきい値や向きを変えたあとに、古い pass で黙らないようにする。戻り幅が無ければ従来のキーと同じ。 */
function sensorTriggerKey(trigger: AutoTrigger, pass: boolean) {
  const metric = trigger.metric ?? "temperature";
  const h = sensorHysteresis(trigger);
  return `${trigger.deviceId ?? "climate"}:${metric}:${sensorOp(trigger)}:${trigger.value}:${trigger.valueMax ?? ""}${h ? `:h${h}` : ""}:${pass ? "pass" : "fail"}`;
}

/** 条件が成立しているときのキー。最後の判定がこのキーなら、いまは成立中。 */
export function sensorPassKey(trigger: AutoTrigger) {
  return sensorTriggerKey(trigger, true);
}

/** 小数点第一位に揃える。25.5 - 0.2 の誤差で、境目ちょうどの値を取りこぼさない。 */
function tenth(n: number) {
  return Math.round(n * 10) / 10;
}

/**
 * `held` は直前の判定で成立していたか。成立中だけ、境目を戻り幅のぶん外へ広げる。
 * 以上は しきい値 − 戻り幅 を下回るまで、以下は しきい値 + 戻り幅 を上回るまで、
 * 範囲は両端を戻り幅のぶん広げたあいだ、成立を続ける。
 */
export function sensorTriggerDecision(raw: number, trigger: AutoTrigger, held = false): { pass: boolean; key: string } {
  const op = sensorOp(trigger);
  const lo = trigger.value;
  const hi = trigger.valueMax;
  const margin = held ? sensorHysteresis(trigger) : 0;
  const edge = (n: number, delta: number) => (margin ? tenth(n + delta) : n);
  let pass: boolean;
  if (op === "between") {
    const min = Math.min(lo ?? 0, hi ?? lo ?? 0);
    const max = Math.max(lo ?? 0, hi ?? lo ?? 0);
    // 上限は含めない。25〜25.5 と 25.5〜26 が同じ 25.5 で二重に当たらない。
    pass = raw >= edge(min, -margin) && raw < edge(max, margin);
  } else if (op === "lte") {
    pass = raw <= edge(lo ?? 0, margin);
  } else {
    pass = raw >= edge(lo ?? 0, -margin);
  }
  return { pass, key: sensorTriggerKey(trigger, pass) };
}
