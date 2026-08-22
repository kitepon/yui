import assert from "node:assert/strict";
import { test } from "node:test";
import type Stripe from "stripe";
import {
  billingPlanDetails,
  entitlementFromSubscription,
  parseBillingPlan,
  planForPriceId,
} from "./billing-core.ts";

test("plan names", () => {
  assert.equal(parseBillingPlan("monthly"), "monthly");
  assert.equal(parseBillingPlan("annual"), "annual");
  assert.throws(() => parseBillingPlan("weekly"));
  assert.equal(billingPlanDetails("monthly").price, "100円（税込）");
  assert.equal(billingPlanDetails("annual").price, "1,000円（税込）");
});

test("unknown price is not entitled", () => {
  process.env.STRIPE_MONTHLY_PRICE_ID = "price_month";
  process.env.STRIPE_ANNUAL_PRICE_ID = "price_year";
  assert.equal(planForPriceId("price_month"), "monthly");
  const sub = {
    status: "active",
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_other" }, current_period_end: 1 }] },
  } as unknown as Stripe.Subscription;
  assert.equal(entitlementFromSubscription(sub).writable, false);
});

test("trialing monthly is writable", () => {
  process.env.STRIPE_MONTHLY_PRICE_ID = "price_month";
  process.env.STRIPE_ANNUAL_PRICE_ID = "price_year";
  const sub = {
    status: "trialing",
    trial_end: 2_000_000_000,
    cancel_at: null,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_month" }, current_period_end: 2_000_000_000 }] },
  } as unknown as Stripe.Subscription;
  const ent = entitlementFromSubscription(sub);
  assert.equal(ent.writable, true);
  assert.equal(ent.status, "trialing");
  assert.equal(ent.plan, "monthly");
});
