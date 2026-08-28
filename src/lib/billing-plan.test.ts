import assert from "node:assert/strict";
import { test } from "node:test";
import { ANNUAL_YEN_LABEL, BILLING, HOSTED_PRICE_COPY, MONTHLY_YEN_LABEL } from "./billing-plan.ts";

test("hostedの入る前の案内は年額1,000円と無料のあと有料", () => {
  assert.equal(MONTHLY_YEN_LABEL, "100円");
  assert.equal(ANNUAL_YEN_LABEL, "1,000円");
  assert.equal(BILLING.trialDays, 30);
  assert.equal(
    HOSTED_PRICE_COPY,
    "年額1,000円。無料のあと有料です。初回30日間は無料、月額は100円です。",
  );
});
