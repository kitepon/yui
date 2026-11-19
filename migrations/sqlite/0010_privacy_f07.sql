-- ログインの接続元IPとブラウザ情報は、結のどこからも読まない。以後は auth/server.ts の hook が保存しない。
UPDATE "session" SET "ipAddress" = NULL, "userAgent" = NULL;

-- 終わった購入手続きは残さない。以後は billing-purchase.ts の purgeEndedPurchaseAttempts が消す。
DELETE FROM "billing_purchase_attempts"
WHERE "expires_at_ms" IS NOT NULL AND "expires_at_ms" <= CAST(strftime('%s', 'now') AS INTEGER) * 1000;
