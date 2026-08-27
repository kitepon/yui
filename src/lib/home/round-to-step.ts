/** `step` の桁に揃える。しきい値は 0.1、時刻などは 1。 */
export function roundToStep(value: number, step: number): number {
  const places = step >= 1 ? 0 : (String(step).split(".")[1]?.length ?? 1);
  return Number((Math.round(value / step) * step).toFixed(places));
}

/** 入力中の文字列を数にする。`,` も小数点として読む。途中の `.` は数にしない。 */
export function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(/,/g, ".");
  if (normalized === "" || normalized === "." || normalized === "-" || normalized === "-.") return null;
  if (normalized.endsWith(".")) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
