import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  aggregateSubscriptions,
  collectUsage,
  fetchAllSubscriptions,
} from "./hosted-metrics.mjs";

test("subscriptionを状態・live plan別に集計し外部IDを返さない", () => {
  const result = aggregateSubscriptions(
    [
      { id: "sub-secret-1", status: "trialing", cancel_at_period_end: false, items: { data: [{ price: { id: "price-monthly" } }] } },
      { id: "sub-secret-2", status: "active", cancel_at_period_end: true, items: { data: [{ price: { id: "price-annual" } }] } },
      { id: "sub-secret-3", status: "canceled", cancel_at_period_end: false, items: { data: [{ price: { id: "price-monthly" } }] } },
    ],
    "price-monthly",
    "price-annual",
  );

  assert.deepEqual(result, {
    total_records: 3,
    live: 2,
    by_status: { trialing: 1, active: 1, canceled: 1 },
    live_by_plan: { monthly: 1, annual: 1, unknown: 0 },
    live_cancel_at_period_end: 1,
  });
  assert.doesNotMatch(JSON.stringify(result), /sub-secret/);
});

test("Stripe paginationを同じread-only取得で最後まで辿る", async () => {
  const requested = [];
  const subscriptions = await fetchAllSubscriptions({
    secretKey: "sk-test-not-real",
    fetchImpl: async (url, options) => {
      requested.push({ url: String(url), authorization: options.headers.authorization });
      const second = url.searchParams.has("starting_after");
      return new Response(JSON.stringify(second
        ? { data: [{ id: "sub-2" }], has_more: false }
        : { data: [{ id: "sub-1" }], has_more: true }), { status: 200 });
    },
  });

  assert.deepEqual(subscriptions.map((item) => item.id), ["sub-1", "sub-2"]);
  assert.match(requested[1].url, /starting_after=sub-1/);
  assert.equal(requested[0].authorization, "Bearer sk-test-not-real");
});

test("home利用proxyは集計値だけを返す", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE "user" (id TEXT PRIMARY KEY);
    CREATE TABLE homes (updated_at TEXT NOT NULL, has_enabled_automation INTEGER NOT NULL);
    INSERT INTO "user" VALUES ('user-secret-1'), ('user-secret-2');
    INSERT INTO homes VALUES ('2026-08-20T00:00:00.000Z', 1), ('2026-06-01T00:00:00.000Z', 0);
  `);
  const result = collectUsage(db, "2026-08-23T00:00:00.000Z");
  db.close();

  assert.deepEqual(result, {
    registered_users: 2,
    homes: 2,
    homes_updated_30d: 1,
    automation_enabled_homes: 1,
  });
  assert.doesNotMatch(JSON.stringify(result), /user-secret/);
});
