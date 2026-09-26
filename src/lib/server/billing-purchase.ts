import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getSqlite } from "./sqlite.ts";

export type PurchaseAttempt = {
  user_id: string;
  attempt_id: string;
  provider: "stripe" | "apple";
  stripe_session_id: string | null;
  expires_at_ms: number | null;
};

export function activePurchaseAttempt(userId: string, now = Date.now(), db: DatabaseSync = getSqlite()) {
  return db.prepare(
    `SELECT user_id, attempt_id, provider, stripe_session_id, expires_at_ms
     FROM billing_purchase_attempts
     WHERE user_id = ? AND (expires_at_ms IS NULL OR expires_at_ms > ?)`,
  ).get(userId, now) as PurchaseAttempt | undefined;
}

export function reservePurchaseAttempt(
  userId: string,
  provider: "stripe" | "apple",
  now = Date.now(),
  db: DatabaseSync = getSqlite(),
) {
  const attemptId = randomUUID();
  // Stripe の準備中だけ短い期限を設ける。セッション作成後はその失効時刻に更新する。
  const expiresAtMs = provider === "stripe" ? now + 2 * 60_000 : null;
  const result = db.prepare(
    `INSERT INTO billing_purchase_attempts
       (user_id, attempt_id, provider, stripe_session_id, expires_at_ms, created_at)
     VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       attempt_id = excluded.attempt_id, provider = excluded.provider,
       stripe_session_id = NULL, expires_at_ms = excluded.expires_at_ms,
       created_at = excluded.created_at
     WHERE billing_purchase_attempts.expires_at_ms IS NOT NULL
       AND billing_purchase_attempts.expires_at_ms <= ?`,
  ).run(userId, attemptId, provider, expiresAtMs, new Date(now).toISOString(), now);
  if (!result.changes) return null;
  return attemptId;
}

export function attachStripeSession(
  userId: string, attemptId: string, sessionId: string, expiresAtMs: number,
  db: DatabaseSync = getSqlite(),
) {
  const result = db.prepare(
    `UPDATE billing_purchase_attempts
     SET stripe_session_id = ?, expires_at_ms = ?
     WHERE user_id = ? AND attempt_id = ? AND provider = 'stripe'`,
  ).run(sessionId, expiresAtMs, userId, attemptId);
  return result.changes === 1;
}

export function releasePurchaseAttempt(
  userId: string, attemptId: string, db: DatabaseSync = getSqlite(),
) {
  db.prepare("DELETE FROM billing_purchase_attempts WHERE user_id = ? AND attempt_id = ?")
    .run(userId, attemptId);
}

export function releaseApplePurchaseAttempt(userId: string, signedAtMs: number, db: DatabaseSync = getSqlite()) {
  db.prepare(
    `DELETE FROM billing_purchase_attempts
     WHERE user_id = ? AND provider = 'apple' AND created_at <= ?`,
  ).run(userId, new Date(signedAtMs).toISOString());
}
