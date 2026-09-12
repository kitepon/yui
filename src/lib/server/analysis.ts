import type { DatabaseSync } from "node:sqlite";
import type { HomeSnapshot } from "@/lib/home/snapshot";
import type { Device } from "@/lib/home/types";
import {
  ANALYSIS_RETENTION_MS,
  CLIMATE_DEVICE_ID,
  ON_METRIC,
  collectOnChanges,
  collectSensorSamples,
  downsamplePoints,
  seriesId,
  seriesLabel,
  seriesUnit,
  shouldWriteSkip,
  type AnalysisOutcome,
  type AnalysisSource,
  type SeriesPoint,
} from "../home/analysis-series.ts";
import { getSqlite } from "./sqlite.ts";

export type DeviceLog = {
  source: AnalysisSource;
  waveId: string;
  automationId?: string;
  automationName?: string;
};

export type AnalysisSeries = {
  id: string;
  deviceId: string;
  metric: string;
  label: string;
  unit: ReturnType<typeof seriesUnit>;
  points: SeriesPoint[];
};

export type AnalysisEventRow = {
  id: string;
  ts: string;
  waveId: string;
  source: AnalysisSource;
  automationId: string | null;
  automationName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  outcome: AnalysisOutcome;
  reason: string | null;
  detail: string | null;
};

export type AnalysisPayload = {
  from: string;
  to: string;
  series: AnalysisSeries[];
  automations: Array<{ id: string; name: string }>;
  devices: Array<{ id: string; name: string }>;
  events: AnalysisEventRow[];
};

type Db = DatabaseSync;

function dbOf(db?: Db) {
  return db ?? getSqlite();
}

export function newWaveId() {
  return `wave-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function eventId() {
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pruneAnalysis(homeId: string, now = Date.now(), db?: Db) {
  const cutoff = new Date(now - ANALYSIS_RETENTION_MS).toISOString();
  const sqlite = dbOf(db);
  sqlite.prepare("DELETE FROM home_samples WHERE home_id = ? AND ts < ?").run(homeId, cutoff);
  sqlite.prepare("DELETE FROM home_events WHERE home_id = ? AND ts < ?").run(homeId, cutoff);
}

function latestOnValues(homeId: string, sqlite: Db): Map<string, number> {
  const rows = sqlite
    .prepare(
      `SELECT s.device_id AS device_id, s.value AS value
       FROM home_samples s
       JOIN (
         SELECT device_id, MAX(ts) AS ts
         FROM home_samples
         WHERE home_id = ? AND metric = ?
         GROUP BY device_id
       ) last ON last.device_id = s.device_id AND last.ts = s.ts
       WHERE s.home_id = ? AND s.metric = ?`,
    )
    .all(homeId, ON_METRIC, homeId, ON_METRIC) as Array<{ device_id: string; value: number }>;
  return new Map(rows.map((row) => [row.device_id, row.value]));
}

export function insertSamples(
  homeId: string,
  ts: string,
  points: Array<{ deviceId: string; metric: string; value: number }>,
  db?: Db,
) {
  if (!points.length) return;
  const sqlite = dbOf(db);
  const stmt = sqlite.prepare(
    "INSERT OR REPLACE INTO home_samples (home_id, ts, device_id, metric, value) VALUES (?, ?, ?, ?, ?)",
  );
  for (const point of points) stmt.run(homeId, ts, point.deviceId, point.metric, point.value);
}

export function recordHomeSamples(homeId: string, snap: HomeSnapshot, ts = new Date().toISOString(), db?: Db) {
  const sqlite = dbOf(db);
  const sensors = collectSensorSamples(snap);
  const ons = collectOnChanges(snap.devices, latestOnValues(homeId, sqlite));
  insertSamples(homeId, ts, [...sensors, ...ons], sqlite);
}

export function recordOnSample(
  homeId: string,
  deviceId: string,
  on: boolean,
  ts = new Date().toISOString(),
  db?: Db,
) {
  insertSamples(homeId, ts, [{ deviceId, metric: ON_METRIC, value: on ? 1 : 0 }], db);
}

type EventInput = {
  homeId: string;
  ts?: string;
  waveId: string;
  source: AnalysisSource;
  automationId?: string;
  automationName?: string;
  deviceId?: string;
  deviceName?: string;
  outcome: AnalysisOutcome;
  reason?: string;
  detail?: string;
};

function lastPairEvent(homeId: string, automationId: string, deviceId: string, sqlite: Db) {
  return sqlite
    .prepare(
      `SELECT outcome, reason FROM home_events
       WHERE home_id = ? AND ifnull(automation_id, '') = ? AND ifnull(device_id, '') = ?
       ORDER BY ts DESC, id DESC LIMIT 1`,
    )
    .get(homeId, automationId, deviceId) as { outcome: string; reason: string | null } | undefined;
}

export function recordEvent(input: EventInput, db?: Db) {
  const sqlite = dbOf(db);
  if (input.outcome === "skipped") {
    const last = lastPairEvent(input.homeId, input.automationId ?? "", input.deviceId ?? "", sqlite);
    if (!shouldWriteSkip(last, input.reason ?? "")) return false;
  }
  sqlite
    .prepare(
      `INSERT INTO home_events
        (id, home_id, ts, wave_id, source, automation_id, automation_name, device_id, device_name, outcome, reason, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      eventId(),
      input.homeId,
      input.ts ?? new Date().toISOString(),
      input.waveId,
      input.source,
      input.automationId ?? null,
      input.automationName ?? null,
      input.deviceId ?? null,
      input.deviceName ?? null,
      input.outcome,
      input.reason ?? null,
      input.detail ?? null,
    );
  return true;
}

export function unauthorizedAnalysis() {
  return Response.json({ error: "ログインが必要です" }, { status: 401 });
}

const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
const BUCKET_MS = 10 * 60 * 1000;

export function loadAnalysis(
  homeId: string,
  from: string,
  to: string,
  snap: Pick<HomeSnapshot, "devices" | "automations">,
  db?: Db,
): AnalysisPayload {
  const sqlite = dbOf(db);
  const sampleRows = sqlite
    .prepare(
      `SELECT ts, device_id, metric, value FROM home_samples
       WHERE home_id = ? AND ts >= ? AND ts <= ?
       ORDER BY ts ASC`,
    )
    .all(homeId, from, to) as Array<{ ts: string; device_id: string; metric: string; value: number }>;

  const priorOn = sqlite
    .prepare(
      `SELECT s.device_id AS device_id, s.value AS value
       FROM home_samples s
       JOIN (
         SELECT device_id, MAX(ts) AS ts FROM home_samples
         WHERE home_id = ? AND metric = ? AND ts < ?
         GROUP BY device_id
       ) last ON last.device_id = s.device_id AND last.ts = s.ts
       WHERE s.home_id = ? AND s.metric = ?`,
    )
    .all(homeId, ON_METRIC, from, homeId, ON_METRIC) as Array<{ device_id: string; value: number }>;

  const eventRows = sqlite
    .prepare(
      `SELECT id, ts, wave_id, source, automation_id, automation_name, device_id, device_name, outcome, reason, detail
       FROM home_events
       WHERE home_id = ? AND ts >= ? AND ts <= ?
       ORDER BY ts DESC, id DESC`,
    )
    .all(homeId, from, to) as Array<{
    id: string;
    ts: string;
    wave_id: string;
    source: AnalysisSource;
    automation_id: string | null;
    automation_name: string | null;
    device_id: string | null;
    device_name: string | null;
    outcome: AnalysisOutcome;
    reason: string | null;
    detail: string | null;
  }>;

  const byKey = new Map<string, SeriesPoint[]>();
  for (const row of priorOn) {
    byKey.set(seriesId(row.device_id, ON_METRIC), [{ ts: from, value: row.value }]);
  }
  for (const row of sampleRows) {
    const id = seriesId(row.device_id, row.metric);
    const list = byKey.get(id) ?? [];
    list.push({ ts: row.ts, value: row.value });
    byKey.set(id, list);
  }

  const deviceById = new Map(snap.devices.map((d) => [d.id, d]));
  const span = Date.parse(to) - Date.parse(from);
  const series: AnalysisSeries[] = [...byKey.entries()].map(([id, points]) => {
    const [deviceId, metric] = splitSeriesId(id);
    const device = deviceId === CLIMATE_DEVICE_ID ? undefined : deviceById.get(deviceId);
    const raw = metric === ON_METRIC || span <= TWO_DAYS_MS ? points : downsamplePoints(points, BUCKET_MS);
    return {
      id,
      deviceId,
      metric,
      label: seriesLabel(deviceId, metric, device),
      unit: seriesUnit(metric),
      points: raw,
    };
  });

  const automations = uniqueById([
    ...snap.automations.map((a) => ({ id: a.id, name: a.name })),
    ...eventRows
      .filter((row) => row.automation_id)
      .map((row) => ({ id: row.automation_id as string, name: row.automation_name ?? row.automation_id ?? "" })),
  ]);
  const devices = uniqueById([
    ...snap.devices.filter((d) => d.source !== "demo" && d.on !== undefined).map((d) => ({ id: d.id, name: d.name })),
    ...eventRows
      .filter((row) => row.device_id)
      .map((row) => ({ id: row.device_id as string, name: row.device_name ?? row.device_id ?? "" })),
    ...series.filter((s) => s.metric === ON_METRIC).map((s) => ({ id: s.deviceId, name: labelDevice(s.deviceId, deviceById) })),
  ]);

  return {
    from,
    to,
    series,
    automations,
    devices,
    events: eventRows.map((row) => ({
      id: row.id,
      ts: row.ts,
      waveId: row.wave_id,
      source: row.source,
      automationId: row.automation_id,
      automationName: row.automation_name,
      deviceId: row.device_id,
      deviceName: row.device_name,
      outcome: row.outcome,
      reason: row.reason,
      detail: row.detail,
    })),
  };
}

function splitSeriesId(id: string): [string, string] {
  const i = id.lastIndexOf(":");
  if (i < 0) return [id, "temperature"];
  return [id.slice(0, i), id.slice(i + 1)];
}

function labelDevice(id: string, byId: Map<string, Device>) {
  return byId.get(id)?.name ?? id;
}

function uniqueById<T extends { id: string; name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function patchDetail(patch: { on?: boolean; targetTemp?: number; mode?: string }) {
  const body: Record<string, unknown> = {};
  if (patch.on !== undefined) body.on = patch.on;
  if (patch.targetTemp != null) body.targetTemp = patch.targetTemp;
  if (patch.mode) body.mode = patch.mode;
  const keys = Object.keys(body);
  return keys.length ? JSON.stringify(body) : undefined;
}
