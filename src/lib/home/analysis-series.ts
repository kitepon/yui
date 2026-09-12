import { reportsActuatorState } from "./device-patch.ts";
import { METRIC_LABEL, sensorTempLabel, type Device, type SensorMetric } from "./types.ts";
import type { HomeSnapshot } from "./snapshot.ts";

export const CLIMATE_DEVICE_ID = "climate";
export const ON_METRIC = "on";
export const ANALYSIS_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export type AnalysisSource = "tick" | "control" | "scene" | "alexa" | "manual";
export type AnalysisOutcome = "sent" | "failed" | "skipped" | "left";
export type AnalysisUnit = "celsius" | "percent" | "lux" | "on";
export type HeldSkipReason = "already_applied" | "unreadable";

export type SamplePoint = {
  deviceId: string;
  metric: string;
  value: number;
};

export type SeriesPoint = { ts: string; value: number };

export function seriesId(deviceId: string, metric: string) {
  return `${deviceId}:${metric}`;
}

export function seriesUnit(metric: string): AnalysisUnit {
  if (metric === "humidity") return "percent";
  if (metric === "lux") return "lux";
  if (metric === ON_METRIC) return "on";
  return "celsius";
}

export function seriesLabel(
  deviceId: string,
  metric: string,
  device?: Pick<Device, "name" | "extra">,
) {
  if (metric === ON_METRIC) return `${device?.name ?? "機器"} 入切`;
  if (deviceId === CLIMATE_DEVICE_ID) {
    if (metric === "temperature") return "室温";
    if (metric === "humidity") return "湿度";
    if (metric === "lux") return "照度";
    return METRIC_LABEL[metric as SensorMetric] ?? metric;
  }
  if (metric === "outdoorTemp") return device?.name ? `${device.name} 外気温` : "外気温";
  const name = metric === "temperature" ? sensorTempLabel(device) : (METRIC_LABEL[metric as SensorMetric] ?? metric);
  return device?.name ? `${device.name} ${name}` : name;
}

export function collectSensorSamples(snap: Pick<HomeSnapshot, "climate" | "devices">): SamplePoint[] {
  const out: SamplePoint[] = [];
  const c = snap.climate;
  if (c.temperature != null) out.push({ deviceId: CLIMATE_DEVICE_ID, metric: "temperature", value: c.temperature });
  if (c.humidity != null) out.push({ deviceId: CLIMATE_DEVICE_ID, metric: "humidity", value: c.humidity });
  if (c.lux != null) out.push({ deviceId: CLIMATE_DEVICE_ID, metric: "lux", value: c.lux });
  for (const device of snap.devices) {
    if (device.source === "demo") continue;
    if (device.temperature != null) out.push({ deviceId: device.id, metric: "temperature", value: device.temperature });
    if (device.humidity != null) out.push({ deviceId: device.id, metric: "humidity", value: device.humidity });
    if (device.lux != null) out.push({ deviceId: device.id, metric: "lux", value: device.lux });
    if (device.outdoorTemp != null) out.push({ deviceId: device.id, metric: "outdoorTemp", value: device.outdoorTemp });
  }
  return out;
}

export function collectOnChanges(
  devices: Array<Pick<Device, "id" | "source" | "on">>,
  previous: Map<string, number>,
): SamplePoint[] {
  const out: SamplePoint[] = [];
  for (const device of devices) {
    if (device.source === "demo" || device.on === undefined) continue;
    const value = device.on ? 1 : 0;
    if (previous.get(device.id) === value) continue;
    out.push({ deviceId: device.id, metric: ON_METRIC, value });
  }
  return out;
}

export function heldSkipReason(device: Pick<Device, "kind" | "id" | "connector" | "source">): HeldSkipReason {
  return reportsActuatorState(device as Device) ? "already_applied" : "unreadable";
}

/** 同じオートメーション×機器×理由の skip が連続しているあいだは書かない。sent は畳まない。 */
export function shouldWriteSkip(
  last: { outcome: string; reason: string | null } | undefined,
  reason: string,
) {
  if (!last) return true;
  return !(last.outcome === "skipped" && last.reason === reason);
}

export function downsamplePoints(points: SeriesPoint[], bucketMs: number): SeriesPoint[] {
  if (points.length < 3) return points;
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const point of points) {
    const t = Date.parse(point.ts);
    if (Number.isNaN(t)) continue;
    const b = Math.floor(t / bucketMs) * bucketMs;
    const cur = buckets.get(b) ?? { sum: 0, n: 0 };
    cur.sum += point.value;
    cur.n += 1;
    buckets.set(b, cur);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ ts: new Date(t).toISOString(), value: v.sum / v.n }));
}
