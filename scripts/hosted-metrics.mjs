#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const LIVE_STATUSES = new Set(["trialing", "active"]);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} が無い`);
  return value;
}

export function aggregateSubscriptions(subscriptions, monthlyPriceId, annualPriceId) {
  const byStatus = {};
  const liveByPlan = { monthly: 0, annual: 0, unknown: 0 };
  let live = 0;
  let cancelAtPeriodEnd = 0;

  for (const subscription of subscriptions) {
    byStatus[subscription.status] = (byStatus[subscription.status] ?? 0) + 1;
    if (!LIVE_STATUSES.has(subscription.status)) continue;

    live += 1;
    if (subscription.cancel_at_period_end || subscription.cancel_at) cancelAtPeriodEnd += 1;
    const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
    if (priceId === monthlyPriceId) liveByPlan.monthly += 1;
    else if (priceId === annualPriceId) liveByPlan.annual += 1;
    else liveByPlan.unknown += 1;
  }

  return {
    total_records: subscriptions.length,
    live,
    by_status: byStatus,
    live_by_plan: liveByPlan,
    live_cancel_at_period_end: cancelAtPeriodEnd,
  };
}

export async function fetchAllSubscriptions({ secretKey, fetchImpl = fetch }) {
  const subscriptions = [];
  let startingAfter = null;

  for (;;) {
    const url = new URL("https://api.stripe.com/v1/subscriptions");
    url.searchParams.set("status", "all");
    url.searchParams.set("limit", "100");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${secretKey}` },
    });
    if (!response.ok) throw new Error(`Stripe subscriptions API が HTTP ${response.status}`);

    const page = await response.json();
    if (!Array.isArray(page.data)) throw new Error("Stripe subscriptions API のdataが配列ではない");
    subscriptions.push(...page.data);
    if (!page.has_more) return subscriptions;
    startingAfter = page.data.at(-1)?.id ?? null;
    if (!startingAfter) throw new Error("Stripe subscriptions API のpagination cursorが無い");
  }
}

export function collectUsage(db, nowIso = new Date().toISOString()) {
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  return {
    registered_users: Number(one('SELECT COUNT(*) AS value FROM "user"').value),
    homes: Number(one("SELECT COUNT(*) AS value FROM homes").value),
    homes_updated_30d: Number(
      one(
        "SELECT COUNT(*) AS value FROM homes WHERE julianday(updated_at) >= julianday(?, '-30 days')",
        nowIso,
      ).value,
    ),
    automation_enabled_homes: Number(
      one("SELECT COUNT(*) AS value FROM homes WHERE has_enabled_automation = 1").value,
    ),
  };
}

export async function collectHostedMetrics() {
  const secretKey = requiredEnv("STRIPE_SECRET_KEY");
  const monthlyPriceId = requiredEnv("STRIPE_MONTHLY_PRICE_ID");
  const annualPriceId = requiredEnv("STRIPE_ANNUAL_PRICE_ID");
  const subscriptions = await fetchAllSubscriptions({ secretKey });

  const dbPath = process.env.YUI_SQLITE_PATH?.trim() || "/data/yui.sqlite";
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA query_only = ON");
  try {
    return {
      schema: "yui.hosted_metrics.v1",
      collected_at: new Date().toISOString(),
      definition:
        "Stripe subscriptionの状態別集計とYui SQLiteのhome保存状態。homes_updated_30dは実操作人数ではなく、30日内に保存更新されたhome件数",
      privacy:
        "集計値だけを出力し、氏名、email、user ID、Stripe customer/subscription ID、home IDを出力しない",
      subscriptions: aggregateSubscriptions(subscriptions, monthlyPriceId, annualPriceId),
      usage: collectUsage(db),
    };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await collectHostedMetrics())}\n`);
}
