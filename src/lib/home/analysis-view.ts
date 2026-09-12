export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

export function clampWindow(
  spanStart: number,
  spanEnd: number,
  viewStart: number,
  viewEnd: number,
  minSpan: number,
): [number, number] {
  if (!(spanEnd > spanStart)) return [spanStart, spanEnd];
  const limit = Math.min(Math.max(0, minSpan), spanEnd - spanStart);
  let a = Math.min(viewStart, viewEnd);
  let b = Math.max(viewStart, viewEnd);
  if (b - a < limit) {
    const mid = (a + b) / 2;
    a = mid - limit / 2;
    b = mid + limit / 2;
  }
  if (a < spanStart) {
    b += spanStart - a;
    a = spanStart;
  }
  if (b > spanEnd) {
    a -= b - spanEnd;
    b = spanEnd;
  }
  a = Math.min(Math.max(a, spanStart), spanEnd);
  b = Math.min(Math.max(b, spanStart), spanEnd);
  if (b - a < limit) return [spanStart, spanEnd];
  return [a, b];
}

export function paddedDomain(values: number[], padRatio = 0.12): [number, number] {
  if (!values.length) return [0, 1];
  let min = values[0] as number;
  let max = values[0] as number;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) {
    const pad = Math.max(0.5, Math.abs(min) * 0.05);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * padRatio;
  return [min - pad, max + pad];
}

export function collectValues(rows: Array<Record<string, number>>, keys: string[]): number[] {
  const out: number[] = [];
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value)) out.push(value);
    }
  }
  return out;
}

export function minSpanSteps(span: number, step: number, minSpan: number): number {
  if (step <= 0) return 1;
  const limit = Math.min(Math.max(0, minSpan), Math.max(0, span));
  return Math.max(1, Math.round(limit / step));
}

export function yScale(unit: "celsius" | "percent" | "lux"): { step: number; minSpan: number; digits: number } {
  if (unit === "percent") return { step: 0.5, minSpan: 2, digits: 1 };
  if (unit === "lux") return { step: 1, minSpan: 10, digits: 0 };
  return { step: 0.1, minSpan: 0.5, digits: 1 };
}
