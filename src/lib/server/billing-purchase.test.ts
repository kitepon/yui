import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  activePurchaseAttempt, attachStripeSession, completePurchaseAttempt, purgeEndedPurchaseAttempts,
  releaseApplePurchaseAttempt, releasePurchaseAttempt, reservePurchaseAttempt,
} from "./billing-purchase.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE \"user\" (id TEXT PRIMARY KEY)");
  db.exec("INSERT INTO \"user\" (id) VALUES ('u1')");
  db.exec(readFileSync(join(root, "migrations/sqlite/0007_billing_purchase.sql"), "utf8"));
  return db;
}

test("同じアカウントのWebとApple購入を同時に開始できない", () => {
  const db = database();
  const apple = reservePurchaseAttempt("u1", "apple", 1_000, db);
  assert.ok(apple);
  assert.equal(reservePurchaseAttempt("u1", "stripe", 2_000, db), null);
  assert.equal(activePurchaseAttempt("u1", 2_000, db)?.provider, "apple");
  releasePurchaseAttempt("u1", apple, db);
  const stripe = reservePurchaseAttempt("u1", "stripe", 3_000, db);
  assert.ok(stripe);
  assert.equal(reservePurchaseAttempt("u1", "apple", 4_000, db), null);
  assert.equal(attachStripeSession("u1", stripe, "cs_123", 100_000, db), true);
  assert.equal(reservePurchaseAttempt("u1", "apple", 99_999, db), null);
  assert.ok(reservePurchaseAttempt("u1", "apple", 100_000, db));
  db.close();
});

test("古いApple取引と別の購入識別子は予約を解除しない", () => {
  const db = database();
  const at = Date.parse("2026-09-26T00:00:00.000Z");
  const attempt = reservePurchaseAttempt("u1", "apple", at, db);
  assert.ok(attempt);
  releasePurchaseAttempt("u1", "wrong-attempt", db);
  releaseApplePurchaseAttempt("u1", at - 1, db);
  assert.equal(activePurchaseAttempt("u1", at + 1, db)?.attempt_id, attempt);
  releaseApplePurchaseAttempt("u1", at + 1, db);
  assert.equal(activePurchaseAttempt("u1", at + 1, db), undefined);
  db.close();
});

test("終わった手続きだけ消える：期限切れと完了。期限なしのAppleは残る", () => {
  const db = database();
  db.exec("INSERT INTO \"user\" (id) VALUES ('u2'), ('u3')");
  assert.ok(reservePurchaseAttempt("u1", "stripe", 1_000, db));
  const s2 = reservePurchaseAttempt("u2", "stripe", 1_000, db);
  assert.ok(s2 && attachStripeSession("u2", s2, "cs_done", 900_000, db));
  assert.ok(reservePurchaseAttempt("u3", "apple", 1_000, db));
  const count = () => (db.prepare("SELECT COUNT(*) AS n FROM billing_purchase_attempts").get() as { n: number }).n;
  purgeEndedPurchaseAttempts(200_000, db); // u1 の準備中（期限 121_000）だけ消える
  assert.equal(count(), 2);
  completePurchaseAttempt("cs_done", db);
  assert.equal(count(), 1);
  db.close();
});
