import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const PREFIX = "sha256:";

/** Alexa のトークンは 256 bit の乱数なので、SHA-256 の一方向の形で保存して引ける。 */
export function alexaTokenHash(token: string) {
  return PREFIX + createHash("sha256").update(token).digest("hex");
}

/** 今ある平文の行を一度だけハッシュへ直す。直した行は同じトークンで引けるので、Alexa の連携は切れない。 */
export function hashLegacyAlexaRows(db: DatabaseSync) {
  const plain = `NOT LIKE '${PREFIX}%'`;
  const codes = db.prepare(`SELECT code FROM alexa_auth_codes WHERE code ${plain}`).all() as Array<{ code: string }>;
  const tokens = db
    .prepare(`SELECT access_token AS a, refresh_token AS r FROM alexa_tokens WHERE access_token ${plain} OR refresh_token ${plain}`)
    .all() as Array<{ a: string; r: string }>;
  if (!codes.length && !tokens.length) return;
  const hash = (v: string) => (v.startsWith(PREFIX) ? v : alexaTokenHash(v));
  db.exec("BEGIN");
  try {
    const c = db.prepare("UPDATE alexa_auth_codes SET code = ? WHERE code = ?");
    for (const row of codes) c.run(hash(row.code), row.code);
    const t = db.prepare("UPDATE alexa_tokens SET access_token = ?, refresh_token = ? WHERE access_token = ? AND refresh_token = ?");
    for (const row of tokens) t.run(hash(row.a), hash(row.r), row.a, row.r);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
