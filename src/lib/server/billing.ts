import Stripe from "stripe";
import { auth } from "../auth/server.ts";
import { getSqlite } from "./sqlite.ts";
import { publicOrigin } from "./origin.ts";
import {
  billingConfigured,
  emptyEntitlement,
  entitlementFromSubscription,
  priceIdForPlan,
  type BillingPlan,
  type Entitlement,
} from "./billing-core.ts";

export {
  billingConfigured,
  billingPlanDetails,
  entitlementFromSubscription,
  parseBillingPlan,
  planForPriceId,
  priceIdForPlan,
  type BillingPlan,
  type Entitlement,
} from "./billing-core.ts";

const cache = new Map<string, { at: number; value: Entitlement }>();
const CACHE_MS = 10 * 60 * 1000;


let stripe: Stripe | null = null;
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY が無い");
  stripe ??= new Stripe(key);
  return stripe;
}

export async function requireUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return null;
  return session.user;
}

export function loadCustomerId(userId: string) {
  const row = getSqlite()
    .prepare(`SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?`)
    .get(userId) as { stripe_customer_id: string } | undefined;
  return row?.stripe_customer_id ?? null;
}

export function saveCustomerId(userId: string, customerId: string) {
  const now = new Date().toISOString();
  getSqlite()
    .prepare(
      `INSERT INTO billing_customers (user_id, stripe_customer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, updated_at = excluded.updated_at`,
    )
    .run(userId, customerId, now, now);
}

export async function getOrCreateCustomer(userId: string, email: string, name?: string | null) {
  const existing = loadCustomerId(userId);
  if (existing) return existing;
  const customer = await getStripe().customers.create(
    { email, name: name || email, metadata: { userId, service: "yuihome" } },
    { idempotencyKey: `yuihome-customer-${userId}` },
  );
  saveCustomerId(userId, customer.id);
  return customer.id;
}

export async function loadEntitlement(userId: string, now = Date.now()): Promise<Entitlement> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const value = await fetchEntitlement(userId);
  cache.set(userId, { at: now, value });
  return value;
}

export function forgetEntitlement(userId: string) {
  cache.delete(userId);
}

async function fetchEntitlement(userId: string): Promise<Entitlement> {
  if (!billingConfigured()) {
    return emptyEntitlement("課金の設定がありません。");
  }
  const customer = loadCustomerId(userId);
  if (!customer) {
    return emptyEntitlement("月額300円または年額3,000円。初回14日間は無料です。");
  }
  const list = await getStripe().subscriptions.list({
    customer,
    status: "all",
    limit: 10,
  });
  const live = list.data.find((sub) => sub.status === "trialing" || sub.status === "active");
  if (!live) {
    return emptyEntitlement("現在は閲覧のみです。支払い方法を登録して無料体験または契約を始めてください。");
  }
  return entitlementFromSubscription(live);
}

export async function trialEligible(customerId: string) {
  const list = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 1 });
  return list.data.length === 0;
}

export async function startCheckout(input: {
  userId: string;
  email: string;
  name?: string | null;
  plan: BillingPlan;
}) {
  if (!billingConfigured()) throw new Error("課金の設定がありません");
  const current = await loadEntitlement(input.userId);
  if (current.writable) throw new Error("すでに利用中です");
  const customer = await getOrCreateCustomer(input.userId, input.email, input.name);
  const eligible = await trialEligible(customer);
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      client_reference_id: input.userId,
      line_items: [{ price: priceIdForPlan(input.plan), quantity: 1 }],
      locale: "ja",
      success_url: `${publicOrigin()}/settings?checkout=completed`,
      cancel_url: `${publicOrigin()}/settings?checkout=canceled`,
      metadata: { userId: input.userId, plan: input.plan, service: "yuihome" },
      subscription_data: {
        metadata: { userId: input.userId, plan: input.plan, service: "yuihome" },
        ...(eligible ? { trial_period_days: 14 } : {}),
      },
    },
    { idempotencyKey: `yuihome-checkout-${input.userId}-${input.plan}-${eligible ? "trial" : "paid"}` },
  );
  if (!session.url) throw new Error("Checkout の URL が無い");
  forgetEntitlement(input.userId);
  return session.url;
}

export async function startPortal(userId: string) {
  const customer = loadCustomerId(userId);
  if (!customer) throw new Error("契約がありません");
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: `${publicOrigin()}/settings`,
  });
  return session.url;
}

export function recordWebhookEvent(id: string, type: string) {
  const result = getSqlite()
    .prepare(`INSERT OR IGNORE INTO stripe_webhook_events (id, type, received_at) VALUES (?, ?, ?)`)
    .run(id, type, new Date().toISOString());
  return result.changes > 0;
}

export function paywall() {
  return Response.json(
    { error: "契約が必要です", billing: true },
    { status: 402 },
  );
}
