import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { decryptJson, encryptJson, secretsKeyFromEnv } from "./home-secrets.ts";
import { getSqlite } from "./sqlite.ts";

const bundleId = "dev.kitepon.yuihome";
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function config() {
  const teamId = process.env.APPLE_SIGNIN_TEAM_ID?.trim();
  const keyId = process.env.APPLE_SIGNIN_KEY_ID?.trim();
  const privateKey = process.env.APPLE_SIGNIN_PRIVATE_KEY_BASE64?.trim();
  if (!teamId || !keyId || !privateKey) throw new Error("Appleログインのサーバー設定がありません");
  const pem = Buffer.from(privateKey, "base64").toString("utf8");
  if (!pem.includes("-----BEGIN PRIVATE KEY-----")) throw new Error("Appleログインの鍵が不正です");
  return { teamId, keyId, pem };
}

async function clientSecret() {
  const { teamId, keyId, pem } = config();
  const key = await importPKCS8(pem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(bundleId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

async function appleTokenRequest(path: "token" | "revoke", fields: Record<string, string>) {
  const response = await fetch(`https://appleid.apple.com/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: bundleId, client_secret: await clientSecret(), ...fields }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Appleログインの${path === "token" ? "認証" : "解除"}に失敗しました (${response.status})`);
  return response;
}

/** Better Auth の Apple identity token でログインした同一人物の認可コードだけを保存する。 */
export async function saveAppleLoginToken(userId: string, code: string) {
  const response = await appleTokenRequest("token", { code, grant_type: "authorization_code" });
  const tokens = await response.json() as { id_token?: string; refresh_token?: string };
  if (!tokens.id_token || !tokens.refresh_token) throw new Error("Appleログインの応答が不完全です");
  const { payload } = await jwtVerify(tokens.id_token, appleKeys, {
    issuer: "https://appleid.apple.com", audience: bundleId,
  });
  if (!payload.sub) throw new Error("Appleログインの利用者IDがありません");
  const appleAccount = getSqlite().prepare(
    "SELECT 1 FROM account WHERE userId = ? AND providerId = 'apple' AND accountId = ?",
  ).get(userId, payload.sub);
  if (!appleAccount) throw new Error("Appleログインと結のアカウントが一致しません");
  getSqlite().prepare(
    `INSERT INTO apple_login_tokens (user_id, refresh_token_enc, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET refresh_token_enc = excluded.refresh_token_enc,
       updated_at = excluded.updated_at`,
  ).run(userId, encryptJson(secretsKeyFromEnv(), { refreshToken: tokens.refresh_token }), new Date().toISOString());
}

export async function revokeAppleLogin(userId: string) {
  const row = getSqlite().prepare("SELECT refresh_token_enc FROM apple_login_tokens WHERE user_id = ?")
    .get(userId) as { refresh_token_enc: string } | undefined;
  if (!row) return;
  const { refreshToken } = decryptJson<{ refreshToken: string }>(secretsKeyFromEnv(), row.refresh_token_enc);
  await appleTokenRequest("revoke", { token: refreshToken, token_type_hint: "refresh_token" });
}
