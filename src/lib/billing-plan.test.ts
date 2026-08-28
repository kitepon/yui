import assert from "node:assert/strict";
import { test } from "node:test";
import { ANNUAL_YEN_LABEL, BILLING, HOSTED_PRICE_COPY, MONTHLY_YEN_LABEL } from "./billing-plan.ts";

test("hostedの入る前の案内は30日無料と月100円／年1,000円", () => {
  assert.equal(MONTHLY_YEN_LABEL, "100円");
  assert.equal(ANNUAL_YEN_LABEL, "1,000円");
  assert.equal(BILLING.trialDays, 30);
  assert.equal(
    HOSTED_PRICE_COPY,
    "月額100円または年額1,000円。初回30日間は無料です。",
  );
});
