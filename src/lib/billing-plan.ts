/**
 * 料金と体験期間の正本。画面・規約・特商法・Stripe への指示はすべてここから引く。
 *
 * サーバー専用の依存を持たない（画面からも読むため）。金額を変えるときは、
 * ここと Stripe ダッシュボードの price を同時に直す。
 */
export const BILLING = {
  monthlyYen: 100,
  annualYen: 1000,
  trialDays: 30,
} as const;

/** 申込み確認パネルに出す、この利用者の初回請求。体験の対象なら体験の終わりの日。 */
export function firstCharge(plan: "monthly" | "annual", trialEligible: boolean, nowMs: number) {
  const yen = plan === "monthly" ? BILLING.monthlyYen : BILLING.annualYen;
  return { yen, at: nowMs + (trialEligible ? BILLING.trialDays * 86_400_000 : 0) };
}

export const MONTHLY_YEN_LABEL = `${BILLING.monthlyYen.toLocaleString("ja-JP")}円`;
export const ANNUAL_YEN_LABEL = `${BILLING.annualYen.toLocaleString("ja-JP")}円`;

/** 契約前に出す公式hosted版の料金。年額と無料のあと有料を先に書く。入る画面と未契約時の案内で同じ文を使う。 */
export const HOSTED_PRICE_COPY = `年額${ANNUAL_YEN_LABEL}。無料のあと有料です。初回${BILLING.trialDays}日間は無料、月額は${MONTHLY_YEN_LABEL}です。`;
