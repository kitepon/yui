import Stripe from "stripe";
import { auth } from "../auth/server.ts";
import { HOSTED_PRICE_COPY } from "../billing-plan.ts";
import { getSqlite } from "./sqlite.ts";
import { publicOrigin } from "./origin.ts";
import { appleEntitlement } from "./apple-billing-core.ts";
import { appleBillingConfigured, appleSubscriptionRows, refreshAppleSubscription } from "./apple-billing.ts";
import { activePurchaseAttempt, attachStripeSession, releasePurchaseAttempt, reservePurchaseAttempt } from "./billing-purchase.ts";
import {
  billingConfigured,
  emptyEntitlement,
  entitlementFromSubscription,
  exemptEmails,
  exemptEntitlement,
  priceIdForPlan,
  unfinishedStripeSubscription,
  BILLING,
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

export function userIdForCustomerId(customerId: string) {
  const row = getSqlite()
    .prepare("SELECT user_id FROM billing_customers WHERE stripe_customer_id = ?")
    .get(customerId) as { user_id: string } | undefined;
  return row?.user_id ?? null;
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
  const apple = appleEntitlement(appleSubscriptionRows(userId), now);
  if (apple.writable) return apple;
  return loadStripeEntitlement(userId, now);
}

export async function loadStripeEntitlement(userId: string, now = Date.now()): Promise<Entitlement> {
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
  const exempt = exemptEmails();
  if (exempt.length) {
    const row = getSqlite().prepare(`SELECT email FROM user WHERE id = ?`).get(userId) as
      | { email: string }
      | undefined;
    if (row && exempt.includes(row.email.toLowerCase())) return exemptEntitlement();
  }
  if (!billingConfigured()) {
    return emptyEntitlement("課金の設定がありません。");
  }
  const customer = loadCustomerId(userId);
  if (!customer) {
    return emptyEntitlement(HOSTED_PRICE_COPY);
  }
  const list = await stripeSubscriptions(customer);
  const live = list.find((sub) => sub.status === "trialing" || sub.status === "active");
  if (!live) {
    return emptyEntitlement("現在は閲覧のみです。支払い方法を登録して無料体験または契約を始めてください。");
  }
  return entitlementFromSubscription(live);
}

async function stripeSubscriptions(customerId: string) {
  const subscriptions: Stripe.Subscription[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await getStripe().subscriptions.list({
      customer: customerId, status: "all", limit: 100,
      ...(after ? { starting_after: after } : {}),
    });
    subscriptions.push(...page.data);
    if (!page.has_more) return subscriptions;
    after = page.data.at(-1)?.id;
    if (!after) throw new Error("Stripeの契約一覧が不完全です");
  }
}

export async function assertNoStripeContract(userId: string) {
  const customer = loadCustomerId(userId);
  if (!customer) return;
  const subscriptions = await stripeSubscriptions(customer);
  if (subscriptions.some(unfinishedStripeSubscription)) {
    throw new Error("Webの契約手続きが残っています。Webのアカウント設定で確認してください");
  }
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
  const attemptId = reservePurchaseAttempt(input.userId, "stripe");
  if (!attemptId) {
    const pending = activePurchaseAttempt(input.userId);
    throw new Error(pending?.provider === "apple"
      ? "App Storeの購入手続き中です。完了を待ってから契約状態を更新してください"
      : "Webの購入手続き中です。開いている決済画面で完了してください");
  }
  let session: Stripe.Checkout.Session | null = null;
  try {
    if (appleSubscriptionRows(input.userId).length) {
      if (!appleBillingConfigured()) throw new Error("Appleの契約状態を確認できません");
      await refreshAppleSubscription(input.userId);
    }
    forgetEntitlement(input.userId);
    const current = await loadEntitlement(input.userId);
    if (current.writable) throw new Error("すでに契約中です");
    await assertNoStripeContract(input.userId);
    const customer = await getOrCreateCustomer(input.userId, input.email, input.name);
    const open = await getStripe().checkout.sessions.list({ customer, status: "open", limit: 100 });
    if (open.data.some((item) => item.metadata?.service === "yuihome")) {
      throw new Error("Webの購入手続き中です。開いている決済画面で完了してください");
    }
    const eligible = await trialEligible(customer);
    session = await getStripe().checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: input.userId,
        line_items: [{ price: priceIdForPlan(input.plan), quantity: 1 }],
        locale: "ja",
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${publicOrigin()}/settings?checkout=completed`,
        cancel_url: `${publicOrigin()}/settings?checkout=canceled`,
        metadata: { userId: input.userId, plan: input.plan, service: "yuihome" },
        subscription_data: {
          metadata: { userId: input.userId, plan: input.plan, service: "yuihome" },
          ...(eligible ? { trial_period_days: BILLING.trialDays } : {}),
        },
      },
      { idempotencyKey: `yuihome-checkout-${attemptId}` },
    );
    if (!session.url || !attachStripeSession(input.userId, attemptId, session.id, session.expires_at * 1000)) {
      throw new Error("Checkout の購入手続きを確保できませんでした");
    }
    return session.url;
  } catch (error) {
    if (session) {
      try {
        await getStripe().checkout.sessions.expire(session.id);
        releasePurchaseAttempt(input.userId, attemptId);
      } catch (expireError) {
        console.error("[yui] Stripe Checkoutを失効できませんでした", expireError);
      }
    } else {
      releasePurchaseAttempt(input.userId, attemptId);
    }
    throw error;
  }
}

export async function cancelStripeCheckout(userId: string) {
  const pending = activePurchaseAttempt(userId);
  if (!pending) return;
  if (pending.provider !== "stripe" || !pending.stripe_session_id) {
    throw new Error("キャンセルできるWeb購入手続きがありません");
  }
  const session = await getStripe().checkout.sessions.retrieve(pending.stripe_session_id);
  if (session.status === "open") await getStripe().checkout.sessions.expire(session.id);
  else if (session.status !== "expired") throw new Error("決済が完了しています。契約状態を更新してください");
  releasePurchaseAttempt(userId, pending.attempt_id);
  forgetEntitlement(userId);
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
