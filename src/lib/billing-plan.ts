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

export const MONTHLY_YEN_LABEL = `${BILLING.monthlyYen.toLocaleString("ja-JP")}円`;
export const ANNUAL_YEN_LABEL = `${BILLING.annualYen.toLocaleString("ja-JP")}円`;
