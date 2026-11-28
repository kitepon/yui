import type { DatabaseSync } from "node:sqlite";

export type EntryEvent =
  | { type: "joined"; from: string; into: string }
  | { type: "emptied"; entry: string }
  | { type: "added" | "removed"; entry: string; key: string; role: "parent" | "child" };

/** A deleted home's random id is kept this long so that a restore of a backup written just before the deletion does not bring it back. */
export const TOMBSTONE_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

/** Delete a home and every way into it. The home's history goes with it (cascade). The tombstone holds only the random id and the date. */
export function deleteHomeOf(db: DatabaseSync, owner: string, now = Date.now()) {
  const gone = Number(db.prepare("DELETE FROM homes WHERE owner_user_id = ?").run(owner).changes);
  db.prepare("DELETE FROM alexa_tokens WHERE user_id = ?").run(owner);
  db.prepare("DELETE FROM alexa_auth_codes WHERE user_id = ?").run(owner);
  db.prepare("DELETE FROM link_codes WHERE entry_id = ?").run(owner);
  if (gone) db.prepare("INSERT OR IGNORE INTO deleted_users (user_id, deleted_at) VALUES (?, ?)").run(owner, new Date(now).toISOString());
  return gone > 0;
}

/**
 * The library sends one "emptied" event whatever emptied the entry, so an emptied entry's home is deleted at once: nobody can reach it
 * and holding it would be holding it "just in case" (Miranda, 2026-11-28). The app says so before the last device leaves.
 */
export function handleEntryEvent(db: DatabaseSync, event: EntryEvent, now = Date.now()) {
  if (event.type === "added" || event.type === "removed") return;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (event.type === "emptied") {
      deleteHomeOf(db, event.entry, now);
    } else if (db.prepare("SELECT 1 FROM homes WHERE owner_user_id = ?").get(event.into)) {
      deleteHomeOf(db, event.from, now);
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

/** Account deletion, step 1: everything of this entry at once. */
export function deleteAccountData(db: DatabaseSync, entry: string, now = Date.now()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const gone = deleteHomeOf(db, entry, now);
    db.exec("COMMIT");
    return gone;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function purgeTombstones(db: DatabaseSync, now = Date.now()) {
  return Number(db.prepare("DELETE FROM deleted_users WHERE deleted_at < ?").run(new Date(now - TOMBSTONE_KEEP_MS).toISOString()).changes);
}
