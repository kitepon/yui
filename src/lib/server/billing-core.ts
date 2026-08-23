import type Stripe from "stripe";
import { BILLING } from "../billing-plan.ts";

export type BillingPlan = "monthly" | "annual";

export type Entitlement = {
  writable: boolean;
  status: "none" | "trialing" | "active" | "read_only";
  plan: BillingPlan | null;
  message: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export function parseBillingPlan(value: string): BillingPlan {
  if (value !== "monthly" && value !== "annual") throw new Error("料金プランが不正です");
  return value;
}

export { BILLING } from "../billing-plan.ts";

const MONTHLY_LABEL = `${BILLING.monthlyYen.toLocaleString("ja-JP")}円（税込）`;
const ANNUAL_LABEL = `${BILLING.annualYen.toLocaleString("ja-JP")}円（税込）`;

export function billingPlanDetails(plan: BillingPlan) {
  return plan === "monthly"
    ? { label: "月額プラン", price: MONTHLY_LABEL, renewal: "毎月" }
    : { label: "年額プラン", price: ANNUAL_LABEL, renewal: "毎年" };
}

export function priceIdForPlan(plan: BillingPlan) {
  const key = plan === "monthly" ? "STRIPE_MONTHLY_PRICE_ID" : "STRIPE_ANNUAL_PRICE_ID";
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} が無い`);
  return value;
}

export function planForPriceId(priceId: string | null): BillingPlan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_MONTHLY_PRICE_ID?.trim()) return "monthly";
  if (priceId === process.env.STRIPE_ANNUAL_PRICE_ID?.trim()) return "annual";
  return null;
}

export function billingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_MONTHLY_PRICE_ID?.trim() &&
      process.env.STRIPE_ANNUAL_PRICE_ID?.trim(),
  );
}

/**
 * 課金免除アカウント（YUI_BILLING_EXEMPT にカンマ区切りの email）。
 * Alexa 審査用アカウントなど、契約なしで書き込みを許す相手をここで決める。
 */
export function exemptEmails() {
  return (process.env.YUI_BILLING_EXEMPT ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function exemptEntitlement(): Entitlement {
  return {
    writable: true,
    status: "active",
    plan: null,
    message: "契約なしで利用できるアカウントです。",
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
}

export function emptyEntitlement(message: string): Entitlement {
  return {
    writable: false,
    status: "none",
    plan: null,
    message,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export function entitlementFromSubscription(sub: Stripe.Subscription): Entitlement {
  const priceId = sub.items.data[0]?.price.id ?? null;
  const plan = planForPriceId(priceId);
  const details = plan ? billingPlanDetails(plan) : null;
  const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
  const periodEndSec = Math.max(...sub.items.data.map((item) => item.current_period_end));
  const currentPeriodEnd = Number.isFinite(periodEndSec) ? new Date(periodEndSec * 1000).toISOString() : null;
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end || sub.cancel_at);
  if (sub.status === "trialing" && details) {
    return {
      writable: true,
      status: "trialing",
      plan,
      message: cancelAtPeriodEnd
        ? `無料体験は${fmt(trialEndsAt)}までです。解約済みのため、その日に終わり初回請求はありません。`
        : `無料体験は${fmt(trialEndsAt)}までです。終了後は${details.label}（${details.price}）が${details.renewal}自動継続します。`,
      trialEndsAt,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    };
  }
  if (sub.status === "active" && details) {
    return {
      writable: true,
      status: "active",
      plan,
      message: cancelAtPeriodEnd
        ? `${details.label}（${details.price}）を利用中です。${fmt(currentPeriodEnd)}に終了します。`
        : `${details.label}（${details.price}）を${details.renewal}自動継続で利用中です。`,
      trialEndsAt,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    };
  }
  return emptyEntitlement("現在は閲覧のみです。支払い方法を登録して無料体験または契約を始めてください。");
}
