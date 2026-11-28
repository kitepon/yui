import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { decryptJson, encryptJson } from "./home-secrets.ts";

export const HOME_KEY_AAD_V2 = "yuihome:home-secrets-v2";

export function storedHomeKey(db: DatabaseSync) {
  return db.prepare("SELECT wrapped, aad FROM home_key WHERE id = 1").get() as { wrapped: string; aad: string } | undefined;
}

/**
 * Replace the home key: everything that is encrypted under it is re-encrypted and the new wrapped key is stored, in one transaction.
 * `wrap` (the authentication module) runs first: if it fails nothing has changed. The caller then uses the returned new key in memory.
 */
export async function rotateHomeKey(
  db: DatabaseSync,
  oldKey: Buffer,
  wrap: (newKeyHex: string) => Promise<string>,
  now = new Date(),
) {
  const newKey = randomBytes(32);
  const wrapped = await wrap(newKey.toString("hex"));
  db.exec("BEGIN IMMEDIATE");
  try {
    const homes = db.prepare("SELECT id, credentials_enc AS c FROM homes").all() as { id: string; c: string }[];
    const setHome = db.prepare("UPDATE homes SET credentials_enc = ? WHERE id = ?");
    for (const h of homes) setHome.run(encryptJson(newKey, decryptJson(oldKey, h.c)), h.id);
    const tokens = db.prepare("SELECT user_id AS u, refresh_token_enc AS t FROM apple_login_tokens").all() as { u: string; t: string }[];
    const setToken = db.prepare("UPDATE apple_login_tokens SET refresh_token_enc = ? WHERE user_id = ?");
    for (const t of tokens) setToken.run(encryptJson(newKey, decryptJson(oldKey, t.t)), t.u);
    db.prepare(
      `INSERT INTO home_key (id, wrapped, aad, rotated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET wrapped = excluded.wrapped, aad = excluded.aad, rotated_at = excluded.rotated_at`,
    ).run(wrapped, HOME_KEY_AAD_V2, now.toISOString());
    db.exec("COMMIT");
    return { key: newKey, homes: homes.length, tokens: tokens.length };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
