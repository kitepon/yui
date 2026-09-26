import assert from "node:assert/strict";
import { test } from "node:test";
import { Status, Type } from "@apple/app-store-server-library";
import { APPLE_PRODUCT_IDS, appleEntitlement, appleSubscriptionWritable, appleTransactionFields, type AppleSubscriptionRow } from "./apple-billing-core.ts";

const now = Date.parse("2026-09-26T10:00:00Z");

function row(changes: Partial<AppleSubscriptionRow> = {}): AppleSubscriptionRow {
  return {
    original_transaction_id: "1001", user_id: "user-1", transaction_id: "1002",
    product_id: APPLE_PRODUCT_IDS.monthly, environment: "Sandbox", status: Status.ACTIVE,
    expires_at_ms: now + 86_400_000, grace_expires_at_ms: null, revoked_at_ms: null,
    auto_renew_status: 1, offer_discount_type: null, state_as_of_ms: now,
    ...changes,
  };
}

test("Appleの有効期間・猶予・返金を利用権に反映する", () => {
  assert.equal(appleSubscriptionWritable(row(), now), true);
  assert.equal(appleSubscriptionWritable(row(), now + 86_400_001), false);
  assert.equal(appleSubscriptionWritable(row({ status: Status.BILLING_GRACE_PERIOD, expires_at_ms: now - 1, grace_expires_at_ms: now + 1000 }), now), true);
  assert.equal(appleSubscriptionWritable(row({ status: Status.BILLING_RETRY }), now), false);
  assert.equal(appleSubscriptionWritable(row({ revoked_at_ms: now - 1000 }), now), false);
});

test("Appleの有効契約はStripeと共通の利用権になる", () => {
  const entitlement = appleEntitlement([row()], now);
  assert.equal(entitlement.writable, true);
  assert.equal(entitlement.provider, "apple");
  assert.equal(entitlement.plan, "monthly");
  assert.equal(appleEntitlement([row({ status: Status.REVOKED })], now).writable, false);
});

test("Appleの署名付き取引は登録した商品と必要な識別子だけ受け付ける", () => {
  const transaction = {
    productId: APPLE_PRODUCT_IDS.annual,
    type: Type.AUTO_RENEWABLE_SUBSCRIPTION,
    originalTransactionId: "1001", transactionId: "1002",
    appAccountToken: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    expiresDate: now + 1000, signedDate: now, environment: "Sandbox",
  };
  const parsed = appleTransactionFields(transaction, Status.ACTIVE);
  assert.equal(parsed.appAccountToken, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.equal(parsed.status, Status.ACTIVE);
  assert.throws(() => appleTransactionFields({ ...transaction, productId: "other" }));
  assert.throws(() => appleTransactionFields({ ...transaction, appAccountToken: undefined }));
});
