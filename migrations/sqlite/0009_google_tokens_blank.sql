-- Google は本人確認にだけ使う。ログインの度に保存していたトークンは、結のどこからも読まない。
-- 今ある Google の行のトークン欄だけを空へ戻す。scope（受け取った権限の記録）、連携そのもの、
-- ほかの provider の行（Apple、メールとパスワード）は変えない。
-- 以後の保存は src/lib/auth/oauth-token-policy.ts が止める。
UPDATE "account"
SET "accessToken" = NULL,
    "refreshToken" = NULL,
    "idToken" = NULL,
    "accessTokenExpiresAt" = NULL,
    "refreshTokenExpiresAt" = NULL
WHERE "providerId" = 'google';
