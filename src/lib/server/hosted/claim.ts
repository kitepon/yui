import type { DatabaseSync } from "node:sqlite";
import { deleteHomeOf } from "./entry-events.ts";

export class ClaimError extends Error {
  readonly status: 401 | 404 | 409;
  constructor(status: 401 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Move one legacy home to an entry. `legacyUserId` is already proven by the caller (the old login, once).
 * One transaction: re-key the home and the Alexa rows, then delete the legacy user (its sessions, accounts and Apple login tokens go with it).
 */
export function claimLegacyHome(db: DatabaseSync, entry: string, legacyUserId: string, now = Date.now()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("SELECT 1 FROM homes WHERE owner_user_id = ?").get(entry)) throw new ClaimError(409, "entry already has a home");
    if (!db.prepare("SELECT 1 FROM homes WHERE owner_user_id = ?").get(legacyUserId)) throw new ClaimError(404, "no legacy home");
    db.prepare("UPDATE homes SET owner_user_id = ? WHERE owner_user_id = ?").run(entry, legacyUserId);
    db.prepare("UPDATE alexa_tokens SET user_id = ? WHERE user_id = ?").run(entry, legacyUserId);
    db.prepare("UPDATE alexa_auth_codes SET user_id = ? WHERE user_id = ?").run(entry, legacyUserId);
    db.prepare("INSERT OR IGNORE INTO deleted_users (user_id, deleted_at) VALUES (?, ?)").run(legacyUserId, new Date(now).toISOString());
    db.prepare('DELETE FROM "user" WHERE id = ?').run(legacyUserId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Tables of the old login and billing that hold nothing on hosted once the window has ended. */
const EMPTIED_AT_WINDOW_END = [
  "billing_customers", "billing_purchase_attempts", "apple_subscriptions", "apple_billing_accounts",
  "apple_deleted_transactions", "apple_notification_events", "stripe_webhook_events", "verification",
];

/**
 * The end of the claim window, run by code on the fixed end date: every unclaimed legacy home is deleted with the legacy rows,
 * the emptied tables are emptied, and the freed pages are overwritten (VACUUM). No legacy subject, e-mail, token or home remains.
 */
export function endClaimWindow(db: DatabaseSync, now = Date.now()) {
  db.exec("BEGIN IMMEDIATE");
  let users = 0;
  try {
    const ids = db.prepare('SELECT id FROM "user"').all() as { id: string }[];
    users = ids.length;
    for (const { id } of ids) deleteHomeOf(db, id, now);
    db.prepare('DELETE FROM "user"').run();
    for (const t of EMPTIED_AT_WINDOW_END) db.prepare(`DELETE FROM ${t}`).run();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
  return users;
}
