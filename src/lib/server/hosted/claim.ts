import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

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
    db.prepare("UPDATE homes SET owner_user_id = ?, orphaned_at = NULL WHERE owner_user_id = ?").run(entry, legacyUserId);
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

/** The end of the claim window: no legacy subject, e-mail or token may remain. Homes stay, unclaimed, for the second period. */
export function endClaimWindow(db: DatabaseSync, now = Date.now()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const ids = db.prepare('SELECT id FROM "user"').all() as { id: string }[];
    db.prepare("UPDATE homes SET orphaned_at = ? WHERE orphaned_at IS NULL AND owner_user_id IN (SELECT id FROM \"user\")").run(now);
    db.prepare("DELETE FROM alexa_tokens WHERE user_id IN (SELECT id FROM \"user\")").run();
    db.prepare("DELETE FROM alexa_auth_codes WHERE user_id IN (SELECT id FROM \"user\")").run();
    const del = db.prepare("INSERT OR IGNORE INTO deleted_users (user_id, deleted_at) VALUES (?, ?)");
    for (const { id } of ids) del.run(id, new Date(now).toISOString());
    // Deleting the user would delete its home through the self-hosted trigger, so each home is first given a random owner key that names no one.
    for (const { id } of ids) db.prepare("UPDATE homes SET owner_user_id = ? WHERE owner_user_id = ?").run(`orphan:${randomUUID()}`, id);
    db.prepare('DELETE FROM "user"').run();
    db.exec("COMMIT");
    return ids.length;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
