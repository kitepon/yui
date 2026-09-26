import { AutoRenewStatus, OfferDiscountType, Status, Type, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import { billingPlanDetails, type BillingPlan, type Entitlement, emptyEntitlement } from "./billing-core.ts";

export const APPLE_PRODUCT_IDS = {
  monthly: "dev.kitepon.yuihome.subscription.monthly",
  annual: "dev.kitepon.yuihome.subscription.annual",
} as const;

export type AppleSubscriptionRow = {
  original_transaction_id: string;
  user_id: string;
  transaction_id: string;
  product_id: string;
  environment: string;
  status: number;
  expires_at_ms: number;
  grace_expires_at_ms: number | null;
  revoked_at_ms: number | null;
  auto_renew_status: number | null;
  offer_discount_type: string | null;
  state_as_of_ms: number;
};

export function planForAppleProduct(productId: string | undefined): BillingPlan | null {
  if (productId === APPLE_PRODUCT_IDS.monthly) return "monthly";
  if (productId === APPLE_PRODUCT_IDS.annual) return "annual";
  return null;
}

export function appleTransactionFields(
  transaction: JWSTransactionDecodedPayload,
  status?: number,
  renewal?: JWSRenewalInfoDecodedPayload,
) {
  if (
    !planForAppleProduct(transaction.productId) ||
    transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION ||
    !transaction.originalTransactionId ||
    !transaction.transactionId ||
    !transaction.appAccountToken ||
    !transaction.expiresDate ||
    !transaction.signedDate ||
    !transaction.environment
  ) throw new Error("Appleのサブスクリプション取引が不正です");
  return {
    originalTransactionId: transaction.originalTransactionId,
    transactionId: transaction.transactionId,
    appAccountToken: transaction.appAccountToken.toLowerCase(),
    productId: transaction.productId!,
    environment: transaction.environment!,
    status: status ?? (transaction.revocationDate ? Status.REVOKED : transaction.expiresDate > Date.now() ? Status.ACTIVE : Status.EXPIRED),
    expiresAtMs: transaction.expiresDate,
    graceExpiresAtMs: renewal?.gracePeriodExpiresDate ?? null,
    revokedAtMs: transaction.revocationDate ?? null,
    autoRenewStatus: renewal?.autoRenewStatus ?? null,
    offerDiscountType: transaction.offerDiscountType ?? null,
    signedAtMs: transaction.signedDate,
  };
}

export function appleSubscriptionWritable(row: AppleSubscriptionRow, now = Date.now()) {
  if (row.revoked_at_ms != null) return false;
  if (row.status === Status.ACTIVE) return row.expires_at_ms > now;
  if (row.status === Status.BILLING_GRACE_PERIOD) return (row.grace_expires_at_ms ?? 0) > now;
  return false;
}

export function appleEntitlement(rows: AppleSubscriptionRow[], now = Date.now()): Entitlement {
  const live = rows.filter((row) => appleSubscriptionWritable(row, now))
    .sort((a, b) => Math.max(b.expires_at_ms, b.grace_expires_at_ms ?? 0) - Math.max(a.expires_at_ms, a.grace_expires_at_ms ?? 0))[0];
  if (!live) return emptyEntitlement("Appleの有効な契約はありません。");
  const plan = planForAppleProduct(live.product_id);
  if (!plan) return emptyEntitlement("Appleの料金プランが確認できません。");
  const trialing = live.offer_discount_type === OfferDiscountType.FREE_TRIAL;
  const periodEnd = new Date(live.grace_expires_at_ms ?? live.expires_at_ms).toISOString();
  const endLabel = new Date(live.grace_expires_at_ms ?? live.expires_at_ms).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
  const cancelAtPeriodEnd = live.auto_renew_status === AutoRenewStatus.OFF;
  const label = billingPlanDetails(plan).label;
  return {
    writable: true,
    provider: "apple",
    status: trialing ? "trialing" : "active",
    plan,
    message: cancelAtPeriodEnd ? `Appleの${label}を利用中です。${endLabel}に終了します。` : `Appleの${label}を利用中です。契約はiPhoneのサブスクリプションで管理できます。`,
    trialEndsAt: trialing ? periodEnd : null,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
  };
}
