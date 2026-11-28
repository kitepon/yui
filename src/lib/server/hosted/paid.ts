import type { DatabaseSync } from "node:sqlite";

export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
/** An annual plan plus a month: the furthest date any phone may state. */
export const MAX_AHEAD_MS = 396 * 24 * 60 * 60 * 1000;

export class PaidDateError extends Error {}

/** The later of the stored and the stated date wins (a stale phone cannot lower it). Returns the stored date. */
export function statePaidUntil(db: DatabaseSync, entry: string, stated: unknown, now = Date.now()) {
  if (typeof stated !== "number" || !Number.isSafeInteger(stated) || stated < 0) throw new PaidDateError("bad date");
  if (stated > now + MAX_AHEAD_MS) throw new PaidDateError("date too far ahead");
  const res = db
    .prepare("UPDATE homes SET paid_until = max(coalesce(paid_until, 0), ?) WHERE owner_user_id = ? AND orphaned_at IS NULL")
    .run(stated, entry);
  if (Number(res.changes) !== 1) return null;
  return (db.prepare("SELECT paid_until AS p FROM homes WHERE owner_user_id = ?").get(entry) as { p: number }).p;
}

/** The only reader of the date: Alexa, the runner and the home routes ask this. */
export function homePaid(db: DatabaseSync, owner: string, now = Date.now()) {
  const row = db.prepare("SELECT paid_until AS p, orphaned_at AS o FROM homes WHERE owner_user_id = ?").get(owner) as
    | { p: number | null; o: number | null }
    | undefined;
  if (!row || row.o !== null || row.p === null) return { paid: false, paidUntil: row?.p ?? null };
  return { paid: row.p + GRACE_MS > now, paidUntil: row.p };
}
