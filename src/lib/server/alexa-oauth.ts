import { randomBytes } from "node:crypto";
import { alexaTokenHash } from "./alexa-token-hash";
import { getSqlite } from "./sqlite";

export function alexaOAuthConfigured() {
  return Boolean(process.env.ALEXA_CLIENT_ID?.trim() && process.env.ALEXA_CLIENT_SECRET?.trim());
}

export function alexaClientId() {
  return process.env.ALEXA_CLIENT_ID?.trim() ?? "";
}

export function alexaClientSecret() {
  return process.env.ALEXA_CLIENT_SECRET?.trim() ?? "";
}

function token() {
  return randomBytes(32).toString("base64url");
}

function isoLater(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

export function issueAlexaCode(userId: string, redirectUri: string) {
  const code = token();
  getSqlite()
    .prepare(
      `INSERT INTO alexa_auth_codes (code, user_id, redirect_uri, expires_at) VALUES (?, ?, ?, ?)`,
    )
    .run(alexaTokenHash(code), userId, redirectUri, isoLater(10 * 60 * 1000));
  return code;
}

export function consumeAlexaCode(code: string, redirectUri: string) {
  const db = getSqlite();
  const row = db
    .prepare(`SELECT user_id AS userId, redirect_uri AS redirectUri, expires_at AS expiresAt FROM alexa_auth_codes WHERE code = ?`)
    .get(alexaTokenHash(code)) as { userId: string; redirectUri: string; expiresAt: string } | undefined;
  if (!row) return null;
  db.prepare(`DELETE FROM alexa_auth_codes WHERE code = ?`).run(alexaTokenHash(code));
  if (row.redirectUri !== redirectUri) return null;
  if (row.expiresAt < new Date().toISOString()) return null;
  return row.userId;
}

export function issueAlexaTokens(userId: string) {
  const access = token();
  const refresh = token();
  getSqlite()
    .prepare(`INSERT INTO alexa_tokens (access_token, refresh_token, user_id, expires_at) VALUES (?, ?, ?, ?)`)
    .run(alexaTokenHash(access), alexaTokenHash(refresh), userId, isoLater(60 * 60 * 1000));
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: 3600,
  };
}

export function userIdForAlexaAccess(accessToken: string) {
  const row = getSqlite()
    .prepare(`SELECT user_id AS userId, expires_at AS expiresAt FROM alexa_tokens WHERE access_token = ?`)
    .get(alexaTokenHash(accessToken)) as { userId: string; expiresAt: string } | undefined;
  if (!row) return null;
  if (row.expiresAt < new Date().toISOString()) return null;
  return row.userId;
}

export function refreshAlexaTokens(refreshToken: string) {
  const db = getSqlite();
  const hashed = alexaTokenHash(refreshToken);
  const row = db
    .prepare(`SELECT user_id AS userId FROM alexa_tokens WHERE refresh_token = ?`)
    .get(hashed) as { userId: string } | undefined;
  if (!row) return null;
  db.prepare(`DELETE FROM alexa_tokens WHERE refresh_token = ?`).run(hashed);
  return issueAlexaTokens(row.userId);
}

export function verifyAlexaClient(id: string, secret?: string) {
  if (id !== alexaClientId()) return false;
  if (secret !== undefined && secret !== alexaClientSecret()) return false;
  return true;
}
