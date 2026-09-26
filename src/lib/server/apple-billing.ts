import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AppStoreServerAPIClient, Environment, SignedDataVerifier,
  type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload,
} from "@apple/app-store-server-library";
import { APPLE_PRODUCT_IDS, appleTransactionFields, type AppleSubscriptionRow } from "./apple-billing-core.ts";
import { forgetEntitlement } from "./billing.ts";
import { releaseApplePurchaseAttempt } from "./billing-purchase.ts";
import { getSqlite } from "./sqlite.ts";

const BUNDLE_ID = "dev.kitepon.yuihome";
const roots = ["AppleIncRootCertificate.cer", "AppleRootCA-G2.cer", "AppleRootCA-G3.cer"];

export class AppleBillingInputError extends Error {}

export function appleBillingConfigured() {
  return Boolean(
    process.env.APPLE_APP_ID?.trim() &&
    process.env.APPLE_IAP_KEY_ID?.trim() &&
    process.env.APPLE_IAP_ISSUER_ID?.trim() &&
    process.env.APPLE_IAP_PRIVATE_KEY_BASE64?.trim(),
  );
}

function config() {
  const appId = Number(process.env.APPLE_APP_ID?.trim());
  const keyId = process.env.APPLE_IAP_KEY_ID?.trim();
  const issuerId = process.env.APPLE_IAP_ISSUER_ID?.trim();
  const privateKey = process.env.APPLE_IAP_PRIVATE_KEY_BASE64?.trim();
  if (!Number.isSafeInteger(appId) || appId <= 0 || !keyId || !issuerId || !privateKey) {
    throw new Error("Appleの課金設定が揃っていません");
  }
  const decodedKey = Buffer.from(privateKey, "base64").toString("utf8");
  if (!decodedKey.includes("-----BEGIN PRIVATE KEY-----")) throw new Error("Appleの課金鍵が不正です");
  return { appId, keyId, issuerId, decodedKey };
}

function environmentOf(jws: string): Environment.PRODUCTION | Environment.SANDBOX {
  const part = jws.split(".")[1];
  if (!part) throw new AppleBillingInputError("Appleの署名データが不正です");
  let body: { environment?: string; data?: { environment?: string } };
  try {
    body = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as typeof body;
  } catch {
    throw new AppleBillingInputError("Appleの署名データが不正です");
  }
  if (!body || typeof body !== "object") throw new AppleBillingInputError("Appleの署名データが不正です");
  const environment = body.environment ?? body.data?.environment;
  if (environment !== Environment.PRODUCTION && environment !== Environment.SANDBOX) {
    throw new AppleBillingInputError("Appleの取引環境が不正です");
  }
  return environment;
}

function verifier(environment: Environment.PRODUCTION | Environment.SANDBOX) {
  const appId = config().appId;
  const certificates = roots.map((file) => readFileSync(join(process.cwd(), "certs/apple", file)));
  return new SignedDataVerifier(certificates, true, environment, BUNDLE_ID, environment === Environment.PRODUCTION ? appId : undefined);
}

async function verifiedTransaction(jws: string) {
  const environment = environmentOf(jws);
  return verifier(environment).verifyAndDecodeTransaction(jws);
}

export function appleAccountToken(userId: string) {
  const sqlite = getSqlite();
  sqlite.prepare(
    `INSERT OR IGNORE INTO apple_billing_accounts (user_id, app_account_token, created_at)
     VALUES (?, ?, ?)`,
  ).run(userId, randomUUID(), new Date().toISOString());
  const row = sqlite.prepare("SELECT app_account_token FROM apple_billing_accounts WHERE user_id = ?")
    .get(userId) as { app_account_token: string };
  return row.app_account_token;
}

export function appleProductIds() {
  return APPLE_PRODUCT_IDS;
}

export function appleSubscriptionRows(userId: string): AppleSubscriptionRow[] {
  return getSqlite().prepare("SELECT * FROM apple_subscriptions WHERE user_id = ?")
    .all(userId) as unknown as AppleSubscriptionRow[];
}

function userForAppleTransaction(transaction: JWSTransactionDecodedPayload) {
  const originalId = transaction.originalTransactionId;
  const token = transaction.appAccountToken?.toLowerCase();
  if (!originalId || !token) throw new AppleBillingInputError("Appleのアカウント識別子がありません");
  const sqlite = getSqlite();
  const account = sqlite.prepare("SELECT user_id FROM apple_billing_accounts WHERE app_account_token = ?")
    .get(token) as { user_id: string } | undefined;
  if (!account) throw new AppleBillingInputError("Appleの取引に対応する結のアカウントがありません");
  const existing = sqlite.prepare("SELECT user_id FROM apple_subscriptions WHERE original_transaction_id = ?")
    .get(originalId) as { user_id: string } | undefined;
  if (existing && existing.user_id !== account.user_id) throw new AppleBillingInputError("Appleの契約は別の結アカウントに紐づいています");
  return account.user_id;
}

function saveTransaction(
  transaction: JWSTransactionDecodedPayload,
  status?: number,
  renewal?: JWSRenewalInfoDecodedPayload,
  expectedUserId?: string,
  stateAsOfMs?: number,
) {
  let fields: ReturnType<typeof appleTransactionFields>;
  try {
    fields = appleTransactionFields(transaction, status, renewal);
  } catch {
    throw new AppleBillingInputError("Appleのサブスクリプション取引が不正です");
  }
  const userId = userForAppleTransaction(transaction);
  if (expectedUserId && userId !== expectedUserId) throw new AppleBillingInputError("Appleの契約は別の結アカウントに紐づいています");
  getSqlite().prepare(
    `INSERT INTO apple_subscriptions (
      original_transaction_id, user_id, transaction_id, product_id, environment, status,
      expires_at_ms, grace_expires_at_ms, revoked_at_ms, auto_renew_status,
      offer_discount_type, state_as_of_ms, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(original_transaction_id) DO UPDATE SET
      transaction_id = excluded.transaction_id, product_id = excluded.product_id,
      environment = excluded.environment, status = excluded.status,
      expires_at_ms = excluded.expires_at_ms, grace_expires_at_ms = excluded.grace_expires_at_ms,
      revoked_at_ms = excluded.revoked_at_ms, auto_renew_status = excluded.auto_renew_status,
      offer_discount_type = excluded.offer_discount_type, state_as_of_ms = excluded.state_as_of_ms,
      updated_at = excluded.updated_at
    WHERE excluded.state_as_of_ms >= apple_subscriptions.state_as_of_ms`,
  ).run(
    fields.originalTransactionId, userId, fields.transactionId, fields.productId,
    fields.environment, fields.status, fields.expiresAtMs, fields.graceExpiresAtMs,
    fields.revokedAtMs, fields.autoRenewStatus, fields.offerDiscountType ?? null,
    stateAsOfMs ?? fields.signedAtMs, new Date().toISOString(),
  );
  if (fields.expiresAtMs > Date.now() && fields.revokedAtMs == null) {
    releaseApplePurchaseAttempt(userId, fields.signedAtMs);
  }
  forgetEntitlement(userId);
  return userId;
}

export async function acceptAppleTransaction(userId: string, signedTransaction: string) {
  const transaction = await verifiedTransaction(signedTransaction);
  saveTransaction(transaction, undefined, undefined, userId);
}

export async function acceptAppleNotification(signedPayload: string) {
  const environment = environmentOf(signedPayload);
  const notification = await verifier(environment).verifyAndDecodeNotification(signedPayload);
  if (!notification.notificationUUID) throw new AppleBillingInputError("Apple通知の識別子がありません");
  if (!notification.signedDate) throw new AppleBillingInputError("Apple通知の時刻がありません");
  const sqlite = getSqlite();
  if (sqlite.prepare("SELECT 1 FROM apple_notification_events WHERE id = ?").get(notification.notificationUUID)) return;
  const signedTransaction = notification.data?.signedTransactionInfo;
  if (signedTransaction) {
    const transaction = await verifier(environment).verifyAndDecodeTransaction(signedTransaction);
    const renewal = notification.data?.signedRenewalInfo
      ? await verifier(environment).verifyAndDecodeRenewalInfo(notification.data.signedRenewalInfo)
      : undefined;
    saveTransaction(transaction, notification.data?.status, renewal, undefined, notification.signedDate);
  }
  sqlite.prepare("INSERT OR IGNORE INTO apple_notification_events (id, received_at) VALUES (?, ?)")
    .run(notification.notificationUUID, new Date().toISOString());
}

export async function refreshAppleSubscription(userId: string) {
  const rows = appleSubscriptionRows(userId);
  if (!rows.length) return;
  const { decodedKey, keyId, issuerId } = config();
  const row = rows.reduce((latest, item) => item.state_as_of_ms > latest.state_as_of_ms ? item : latest);
  const environment = row.environment === Environment.PRODUCTION ? Environment.PRODUCTION : Environment.SANDBOX;
  const client = new AppStoreServerAPIClient(decodedKey, keyId, issuerId, BUNDLE_ID, environment);
  const response = await client.getAllSubscriptionStatuses(row.original_transaction_id);
  if (response.bundleId !== BUNDLE_ID || response.environment !== environment) {
    throw new Error("Appleの契約状態の応答が不正です");
  }
  let found = false;
  for (const group of response.data ?? []) {
    for (const item of group.lastTransactions ?? []) {
      if (!item.signedTransactionInfo || item.status == null) throw new Error("Appleの契約状態が不完全です");
      const transaction = await verifier(environment).verifyAndDecodeTransaction(item.signedTransactionInfo);
      const renewal = item.signedRenewalInfo
        ? await verifier(environment).verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
        : undefined;
      saveTransaction(transaction, item.status, renewal, userId, Date.now());
      found = true;
    }
  }
  if (!found) throw new Error("Appleの契約状態を取得できませんでした");
}
