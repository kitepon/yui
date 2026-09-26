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
  db.exec(readFileSync(join(root, "migrations/sqlite/0006_apple_billing.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/sqlite/0007_billing_purchase.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/sqlite/0008_account_deletion.sql"), "utf8"));
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
  db.prepare("INSERT INTO apple_billing_accounts (user_id, app_account_token, created_at) VALUES (?, ?, ?)")
    .run("user-1", "00000000-0000-0000-0000-000000000001", "2026-01-01");
  db.prepare(`INSERT INTO billing_purchase_attempts
    (user_id, attempt_id, provider, created_at) VALUES (?, ?, ?, ?)`)
    .run("user-1", "attempt-1", "apple", "2026-01-01");
  db.prepare(`INSERT INTO apple_subscriptions (
    original_transaction_id, user_id, transaction_id, product_id, environment, status,
    expires_at_ms, state_as_of_ms, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "original-1", "user-1", "transaction-1", "dev.kitepon.yuihome.subscription.monthly",
    "Sandbox", 1, 1_800_000_000_000, 1_700_000_000_000, "2026-01-01",
  );
  db.prepare("INSERT INTO apple_login_tokens (user_id, refresh_token_enc, updated_at) VALUES (?, ?, ?)")
    .run("user-1", encryptJson(secretsKeyFromEnv(keyHex), { refreshToken: "apple-refresh-secret" }), "2026-01-01");
  db.prepare("INSERT INTO apple_deleted_transactions (original_transaction_id, deleted_at) VALUES (?, ?)")
    .run("deleted-original", "2026-01-01");
  db.prepare("INSERT INTO deleted_users (user_id, deleted_at) VALUES (?, ?)")
    .run("user-deleted", "2026-01-01");
  return db;
}

test("dump encrypts and restore puts rooms and login rows back", () => {
  const db = seed();
  const dump = dumpHomeDb(db);
  assert.equal(dump.user.length, 1);
  assert.equal(dump.homes.length, 1);
  assert.equal(dump.apple_subscriptions?.length, 1);
  assert.equal(dump.billing_purchase_attempts?.length, 1);
  assert.equal(dump.apple_login_tokens?.length, 1);
  assert.equal(dump.apple_deleted_transactions?.length, 1);
  assert.equal(dump.deleted_users?.length, 1);
  const packed = packDump(dump);
  assert.equal(packed.includes("quo@example.com"), false);
  assert.equal(packed.includes("remo-secret"), false);
  assert.equal(packed.includes("apple-refresh-secret"), false);

  db.exec(`DELETE FROM "apple_subscriptions"`);
  db.exec(`DELETE FROM "billing_purchase_attempts"`);
  db.exec(`DELETE FROM "apple_login_tokens"`);
  db.exec(`DELETE FROM "apple_deleted_transactions"`);
  db.exec(`DELETE FROM "deleted_users"`);
  db.exec(`DELETE FROM "apple_billing_accounts"`);
  db.exec(`DELETE FROM "account"`);
  db.exec(`DELETE FROM "homes"`);
  db.exec(`DELETE FROM "user"`);
  assert.equal(dumpHomeDb(db).user.length, 0);

  applyHomeDump(unpackDump(packed), db);
  const restored = dumpHomeDb(db);
  assert.equal(restored.user[0]?.email, "quo@example.com");
  assert.equal(restored.account[0]?.password, "hashed");
  assert.equal(restored.homes[0]?.id, "home-1");
  assert.equal(restored.apple_subscriptions?.[0]?.original_transaction_id, "original-1");
  assert.equal(restored.billing_purchase_attempts?.[0]?.attempt_id, "attempt-1");
  assert.equal(restored.apple_login_tokens?.length, 1);
  assert.equal(restored.apple_deleted_transactions?.[0]?.original_transaction_id, "deleted-original");
  assert.equal(restored.deleted_users?.[0]?.user_id, "user-deleted");
  assert.equal(String(restored.homes[0]?.body_json).includes("居間"), true);
});

test("削除済みアカウントは古いバックアップから復活しない", () => {
  const db = seed();
  const snapshot = dumpHomeDb(db);
  db.prepare(`DELETE FROM "user" WHERE id = ?`).run("user-1");
  db.prepare("INSERT INTO deleted_users (user_id, deleted_at) VALUES (?, ?)")
    .run("user-1", "2026-09-26");
  db.prepare("INSERT INTO apple_deleted_transactions (original_transaction_id, deleted_at) VALUES (?, ?)")
    .run("original-1", "2026-09-26");
  applyHomeDump(snapshot, db);
  assert.equal(dumpHomeDb(db).user.length, 0);
  assert.equal(dumpHomeDb(db).homes.length, 0);
  assert.equal(dumpHomeDb(db).apple_subscriptions?.length, 0);
  assert.equal(dumpHomeDb(db).deleted_users?.length, 2);
  assert.equal(dumpHomeDb(db).apple_deleted_transactions?.length, 2);
});

test("unknown dump version is refused", () => {
  const db = seed();
  assert.throws(() =>
    applyHomeDump({ version: 99, takenAt: "", user: [], account: [], homes: [] } as never, db),
  );
});
