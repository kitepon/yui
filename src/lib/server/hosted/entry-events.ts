import type { DatabaseSync } from "node:sqlite";

export type EntryEvent =
  | { type: "joined"; from: string; into: string }
  | { type: "emptied"; entry: string }
  | { type: "added" | "removed"; entry: string; key: string; role: "parent" | "child" };

/** A home nobody can open stays this long, then it is deleted (docs/hosted-login-billing-contract.md, purgeOrphans). */
export const ORPHAN_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

function dropWayIn(db: DatabaseSync, owner: string) {
  db.prepare("DELETE FROM alexa_tokens WHERE user_id = ?").run(owner);
  db.prepare("DELETE FROM alexa_auth_codes WHERE user_id = ?").run(owner);
  db.prepare("DELETE FROM link_codes WHERE entry_id = ?").run(owner);
}

/** An orphan has no key, so nothing may still reach it by an Alexa token or a link code. */
function orphan(db: DatabaseSync, owner: string, now: number) {
  db.prepare("UPDATE homes SET orphaned_at = ? WHERE owner_user_id = ? AND orphaned_at IS NULL").run(now, owner);
  dropWayIn(db, owner);
}

/** The library sends one "emptied" event whatever emptied the entry, so it always means unclaimed. Account deletion deletes the data first, by its own route. */
export function handleEntryEvent(db: DatabaseSync, event: EntryEvent, now = Date.now()) {
  if (event.type === "added" || event.type === "removed") return;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (event.type === "emptied") {
      orphan(db, event.entry, now);
    } else if (db.prepare("SELECT 1 FROM homes WHERE owner_user_id = ?").get(event.into)) {
      orphan(db, event.from, now);
    } else {
      db.prepare("UPDATE homes SET owner_user_id = ? WHERE owner_user_id = ?").run(event.into, event.from);
      db.prepare("UPDATE alexa_tokens SET user_id = ? WHERE user_id = ?").run(event.into, event.from);
      db.prepare("UPDATE alexa_auth_codes SET user_id = ? WHERE user_id = ?").run(event.into, event.from);
      db.prepare("UPDATE link_codes SET entry_id = ? WHERE entry_id = ?").run(event.into, event.from);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function purgeOrphans(db: DatabaseSync, now = Date.now()) {
  return Number(db.prepare("DELETE FROM homes WHERE orphaned_at IS NOT NULL AND orphaned_at + ? <= ?").run(ORPHAN_KEEP_MS, now).changes);
}

/** Account deletion, step 1: everything of this entry at once. */
export function deleteAccountData(db: DatabaseSync, entry: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const gone = Number(db.prepare("DELETE FROM homes WHERE owner_user_id = ?").run(entry).changes);
    dropWayIn(db, entry);
    db.exec("COMMIT");
    return gone > 0;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
