import type { DatabaseSync } from "node:sqlite";
import { deleteHomeOf } from "./entry-events.ts";

const DAY = 24 * 60 * 60 * 1000;
export const GRACE_MS = 7 * DAY;
/** An annual plan plus a month: the furthest date any phone may state. */
export const MAX_AHEAD_MS = 396 * DAY;
/** A home no signed request has touched for this long, with no paid date ahead, is deleted (a lost only-phone leaves a home nobody reaches). */
export const UNUSED_DELETE_MS = 180 * DAY;

export class PaidDateError extends Error {}

/** The later of the stored and the stated date wins (a stale phone cannot lower it). Returns the stored date, or null when the entry has no home. */
export function statePaidUntil(db: DatabaseSync, entry: string, stated: unknown, now = Date.now()) {
  if (typeof stated !== "number" || !Number.isSafeInteger(stated) || stated < 0) throw new PaidDateError("bad date");
  if (stated > now + MAX_AHEAD_MS) throw new PaidDateError("date too far ahead");
  const res = db
    .prepare("UPDATE homes SET paid_until = max(coalesce(paid_until, 0), ?), last_used_at = ? WHERE owner_user_id = ?")
    .run(stated, now, entry);
  if (Number(res.changes) !== 1) return null;
  return (db.prepare("SELECT paid_until AS p FROM homes WHERE owner_user_id = ?").get(entry) as { p: number }).p;
}

/** A signed request reached the home: a date only, written at most once a day. */
export function touchHome(db: DatabaseSync, owner: string, now = Date.now()) {
  db.prepare("UPDATE homes SET last_used_at = ? WHERE owner_user_id = ? AND (last_used_at IS NULL OR last_used_at < ?)").run(now, owner, now - DAY);
}

/** The only reader of the date: Alexa, the runner and the home routes ask this. */
export function homePaid(db: DatabaseSync, owner: string, now = Date.now()) {
  const row = db.prepare("SELECT paid_until AS p FROM homes WHERE owner_user_id = ?").get(owner) as { p: number | null } | undefined;
  if (!row || row.p === null) return { paid: false, paidUntil: row?.p ?? null };
  return { paid: row.p + GRACE_MS > now, paidUntil: row.p };
}

/** Run by the runner. A paid date still ahead counts as in use. */
export function purgeUnusedHomes(db: DatabaseSync, now = Date.now()) {
  const rows = db
    .prepare(
      `SELECT owner_user_id AS o FROM homes
       WHERE coalesce(last_used_at, CAST(strftime('%s', created_at) AS INTEGER) * 1000) + ? <= ?
         AND (paid_until IS NULL OR paid_until + ? <= ?)`,
    )
    .all(UNUSED_DELETE_MS, now, GRACE_MS, now) as { o: string }[];
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const { o } of rows) deleteHomeOf(db, o, now);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return rows.length;
}
