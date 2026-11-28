import { createHash, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const LINK_CODE_MS = 10 * 60 * 1000;
const PER_ENTRY_PER_HOUR = 5;
const FAILS_PER_WINDOW = 30;
const FAIL_WINDOW_MS = 10 * 60 * 1000;

const hash = (code: string) => createHash("sha256").update(code.toUpperCase()).digest("hex");
const fails: number[] = [];

/** Made in the app by a signed request; typed on the Alexa linking page. One use, 10 minutes. */
export function makeLinkCode(db: DatabaseSync, entry: string, now = Date.now()) {
  const recent = db.prepare("SELECT COUNT(*) AS n FROM link_codes WHERE entry_id = ? AND created_at > ?").get(entry, now - 3600_000) as { n: number };
  if (recent.n >= PER_ENTRY_PER_HOUR) return null;
  // Used and expired rows stay for an hour so the hourly count sees them.
  db.prepare("DELETE FROM link_codes WHERE created_at < ?").run(now - 3600_000);
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  db.prepare("INSERT INTO link_codes (code_hash, entry_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(hash(code), entry, now, now + LINK_CODE_MS);
  return code;
}

/** The entry id the code was made for, or null (wrong, used, expired, or too many wrong tries on this server). No detail is given. */
export function consumeLinkCode(db: DatabaseSync, code: string, now = Date.now()) {
  while (fails.length && fails[0]! < now - FAIL_WINDOW_MS) fails.shift();
  if (fails.length >= FAILS_PER_WINDOW) return null;
  const row = db.prepare("UPDATE link_codes SET used = 1 WHERE code_hash = ? AND used = 0 RETURNING entry_id AS e, expires_at AS x").get(hash(code)) as
    | { e: string; x: number }
    | undefined;
  if (!row || row.x < now) {
    fails.push(now);
    return null;
  }
  return row.e;
}

export function resetLinkCodeFailuresForTests() {
  fails.length = 0;
}
