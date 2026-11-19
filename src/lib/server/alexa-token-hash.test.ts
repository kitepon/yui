import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { alexaTokenHash, hashLegacyAlexaRows } from "./alexa-token-hash.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("平文の行はハッシュへ直り、同じトークンで引け、2回目は何も変えない", () => {
  const db = new DatabaseSync(":memory:");
  db.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY)');
  db.exec("INSERT INTO \"user\" (id) VALUES ('u1')");
  db.exec(readFileSync(join(root, "migrations/sqlite/0004_alexa.sql"), "utf8"));
  db.prepare("INSERT INTO alexa_tokens VALUES ('acc', 'ref', 'u1', '2099-01-01')").run();
  db.prepare("INSERT INTO alexa_auth_codes VALUES ('code', 'u1', 'r', '2099-01-01')").run();
  hashLegacyAlexaRows(db);
  const row = () => db.prepare("SELECT access_token a, refresh_token r FROM alexa_tokens").get() as { a: string; r: string };
  const plainRow = () => ({ ...row() });
  assert.deepEqual(plainRow(), { a: alexaTokenHash("acc"), r: alexaTokenHash("ref") });
  assert.ok(db.prepare("SELECT 1 FROM alexa_auth_codes WHERE code = ?").get(alexaTokenHash("code")));
  hashLegacyAlexaRows(db);
  assert.deepEqual(plainRow(), { a: alexaTokenHash("acc"), r: alexaTokenHash("ref") });
  db.close();
});
