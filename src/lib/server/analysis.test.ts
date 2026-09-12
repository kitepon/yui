import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ANALYSIS_RETENTION_MS } from "../home/analysis-series.ts";
import {
  insertSamples,
  loadAnalysis,
  pruneAnalysis,
  recordEvent,
  unauthorizedAnalysis,
} from "./analysis.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

function seed() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(join(root, "migrations/sqlite/0001_auth.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/sqlite/0002_homes.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/sqlite/0005_analysis.sql"), "utf8"));
  db.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, ?, ?)`,
  ).run("user-1", "クオ", "quo@example.com", "2026-01-01", "2026-01-01");
  db.prepare(
    `INSERT INTO homes (id, owner_user_id, pair_pin, credentials_enc, body_json, has_enabled_automation, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run("home-1", "user-1", "123456", "x", "{}", "2026-01-01", "2026-01-01");
  return db;
}

test("未ログインは 401", async () => {
  const res = unauthorizedAnalysis();
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "ログインが必要です");
});

test("14日を超えたサンプルとイベントを消す", () => {
  const db = seed();
  const now = Date.parse("2026-09-12T00:00:00.000Z");
  const oldTs = new Date(now - ANALYSIS_RETENTION_MS - 60_000).toISOString();
  const keepTs = new Date(now - 3 * 86_400_000).toISOString();
  insertSamples("home-1", oldTs, [{ deviceId: "climate", metric: "temperature", value: 20 }], db);
  insertSamples("home-1", keepTs, [{ deviceId: "climate", metric: "temperature", value: 24 }], db);
  recordEvent(
    {
      homeId: "home-1",
      ts: oldTs,
      waveId: "w1",
      source: "tick",
      outcome: "sent",
      deviceId: "ac",
    },
    db,
  );
  recordEvent(
    {
      homeId: "home-1",
      ts: keepTs,
      waveId: "w2",
      source: "tick",
      outcome: "sent",
      deviceId: "ac",
    },
    db,
  );
  pruneAnalysis("home-1", now, db);
  const samples = db.prepare("SELECT ts FROM home_samples WHERE home_id = ?").all("home-1") as Array<{ ts: string }>;
  const events = db.prepare("SELECT ts FROM home_events WHERE home_id = ?").all("home-1") as Array<{ ts: string }>;
  assert.deepEqual(samples.map((r) => r.ts), [keepTs]);
  assert.deepEqual(events.map((r) => r.ts), [keepTs]);
});

test("同じ skip は1行に畳み、sent は毎回残す", () => {
  const db = seed();
  const skip = {
    homeId: "home-1",
    waveId: "w",
    source: "tick" as const,
    automationId: "auto-1",
    automationName: "水温",
    deviceId: "ac",
    deviceName: "エアコン",
    outcome: "skipped" as const,
    reason: "already_applied",
  };
  assert.equal(recordEvent({ ...skip, ts: "2026-09-12T00:00:00.000Z" }, db), true);
  assert.equal(recordEvent({ ...skip, ts: "2026-09-12T00:01:00.000Z" }, db), false);
  assert.equal(
    recordEvent({ ...skip, outcome: "sent", reason: undefined, ts: "2026-09-12T00:02:00.000Z" }, db),
    true,
  );
  assert.equal(
    recordEvent({ ...skip, outcome: "sent", reason: undefined, ts: "2026-09-12T00:03:00.000Z" }, db),
    true,
  );
  const rows = db
    .prepare("SELECT outcome, ts FROM home_events WHERE home_id = ? ORDER BY ts")
    .all("home-1") as Array<{ outcome: string; ts: string }>;
  assert.deepEqual(
    rows.map((r) => r.outcome),
    ["skipped", "sent", "sent"],
  );
});

test("読み出しは climate の室温ラベルを付ける", () => {
  const db = seed();
  insertSamples("home-1", "2026-09-12T01:00:00.000Z", [{ deviceId: "climate", metric: "temperature", value: 23.5 }], db);
  const payload = loadAnalysis("home-1", "2026-09-12T00:00:00.000Z", "2026-09-12T02:00:00.000Z", {
    devices: [],
    automations: [],
  }, db);
  assert.equal(payload.series.length, 1);
  assert.equal(payload.series[0]?.label, "室温");
  assert.equal(payload.series[0]?.points[0]?.value, 23.5);
});
