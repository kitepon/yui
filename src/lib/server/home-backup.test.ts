import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { applyHomeDump, dumpHomeDb, packDump, unpackDump } from "./home-backup.ts";
import { encryptJson, secretsKeyFromEnv } from "./home-secrets.ts";

const keyHex = "ab".repeat(32);
process.env.HOME_SECRETS_KEY = keyHex;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

function seed() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(join(root, "migrations/sqlite/0001_auth.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/sqlite/0002_homes.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/sqlite/0003_billing.sql"), "utf8"));
  db.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, ?, ?)`,
  ).run("user-1", "クオ", "quo@example.com", "2026-01-01", "2026-01-01");
  db.prepare(
    `INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("acc-1", "user-1", "credential", "user-1", "hashed", "2026-01-01", "2026-01-01");
  const cred = encryptJson(secretsKeyFromEnv(keyHex), { natureToken: "remo-secret" });
  db.prepare(
    `INSERT INTO homes (id, owner_user_id, pair_pin, credentials_enc, body_json, has_enabled_automation, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    "home-1",
    "user-1",
    "123456",
    cred,
    JSON.stringify({ rooms: [{ id: "r1", name: "居間" }] }),
    "2026-01-01",
    "2026-01-01",
  );
  return db;
}

test("dump encrypts and restore puts rooms and login rows back", () => {
  const db = seed();
  const dump = dumpHomeDb(db);
  assert.equal(dump.user.length, 1);
  assert.equal(dump.homes.length, 1);
  const packed = packDump(dump);
  assert.equal(packed.includes("quo@example.com"), false);
  assert.equal(packed.includes("remo-secret"), false);

  db.exec(`DELETE FROM "account"`);
  db.exec(`DELETE FROM "homes"`);
  db.exec(`DELETE FROM "user"`);
  assert.equal(dumpHomeDb(db).user.length, 0);

  applyHomeDump(unpackDump(packed), db);
  const restored = dumpHomeDb(db);
  assert.equal(restored.user[0]?.email, "quo@example.com");
  assert.equal(restored.account[0]?.password, "hashed");
  assert.equal(restored.homes[0]?.id, "home-1");
  assert.equal(String(restored.homes[0]?.body_json).includes("居間"), true);
});

test("unknown dump version is refused", () => {
  const db = seed();
  assert.throws(() =>
    applyHomeDump({ version: 99, takenAt: "", user: [], account: [], homes: [] } as never, db),
  );
});
