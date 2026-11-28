import assert from "node:assert/strict";
import { test } from "node:test";
import { handleEntryEvent, deleteAccountData, purgeTombstones, TOMBSTONE_KEEP_MS } from "./entry-events.ts";
import { SqliteKeyholeStore } from "./keyhole-store.ts";
import { claimLegacyHome, ClaimError, endClaimWindow } from "./claim.ts";
import { consumeLinkCode, makeLinkCode, resetLinkCodeFailuresForTests } from "./link-code.ts";
import { GRACE_MS, homePaid, MAX_AHEAD_MS, PaidDateError, purgeUnusedHomes, statePaidUntil, touchHome } from "./paid.ts";
import { addHome, addUser, testDb } from "./test-db.ts";

const D = 24 * 3600_000;
const count = (db: ReturnType<typeof testDb>, sql: string, ...a: string[]) => (db.prepare(sql).get(...a) as { n: number }).n;

test("the migration keeps existing homes and keeps the self-hosted cascade", () => {
  const db = testDb();
  addUser(db, "u1");
  addHome(db, "u1");
  db.prepare("INSERT INTO home_samples VALUES ('h-u1', 't', 'd', 'm', 1)").run();
  db.prepare("INSERT INTO alexa_tokens VALUES ('a', 'r', 'u1', 'x')").run();
  db.prepare('DELETE FROM "user" WHERE id = ?').run("u1");
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM home_samples"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM alexa_tokens"), 0);
});

test("a home may belong to an entry id that is not a user", () => {
  const db = testDb();
  addHome(db, "entry-1");
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes WHERE owner_user_id = ?", "entry-1"), 1);
});

test("SqliteKeyholeStore: write is all-or-none, deletes first, useOnce is once", () => {
  const db = testDb();
  let t = 1000;
  const s = new SqliteKeyholeStore(db, () => t);
  s.write({ set: [["k1", { entry: "e", role: "parent" }], ["k2", { entry: "e", role: "child" }]], delete: [] });
  assert.deepEqual(s.keyhole("k1"), { entry: "e", role: "parent" });
  assert.equal(s.keys("e").length, 2);
  s.write({ set: [["k2", { entry: "e", role: "parent" }]], delete: ["k2", "k1"] });
  assert.equal(s.keyhole("k1"), undefined);
  assert.equal(s.keyhole("k2")?.role, "parent");
  assert.throws(() => s.write({ set: [["k3", { entry: "e", role: "bad" as never }]], delete: ["k2"] }));
  assert.ok(s.keyhole("k2"), "a failed write changes nothing");
  assert.equal(s.useOnce("n1", 2000), true);
  assert.equal(s.useOnce("n1", 2000), false);
  t = 3000;
  assert.equal(s.useOnce("n1", 9000), true, "an expired record is dropped");
});

test("joined moves the home, the Alexa rows and the link codes; when the target has a home the other is deleted", () => {
  const db = testDb();
  addHome(db, "from");
  db.prepare("INSERT INTO alexa_tokens VALUES ('a', 'r', 'from', 'x')").run();
  const code = makeLinkCode(db, "from", 1000)!;
  handleEntryEvent(db, { type: "joined", from: "from", into: "into" }, 5000);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes WHERE owner_user_id = 'into'"), 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM alexa_tokens WHERE user_id = 'into'"), 1);
  assert.equal(consumeLinkCode(db, code, 2000), "into");

  addHome(db, "a");
  addHome(db, "b");
  db.prepare("INSERT INTO alexa_tokens VALUES ('a2', 'r2', 'a', 'x')").run();
  handleEntryEvent(db, { type: "joined", from: "a", into: "b" }, 7000);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes WHERE owner_user_id = 'a'"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes WHERE owner_user_id = 'b'"), 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM alexa_tokens WHERE user_id = 'a'"), 0);
});

test("emptied deletes the home and its history at once and leaves only a tombstone of the random id", () => {
  const db = testDb();
  addHome(db, "e");
  db.prepare("INSERT INTO home_samples VALUES ('h-e', 't', 'd', 'm', 1)").run();
  const now = Date.now();
  handleEntryEvent(db, { type: "emptied", entry: "e" }, now);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM home_samples"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM deleted_users WHERE user_id = 'e'"), 1);
  assert.equal(purgeTombstones(db, now + TOMBSTONE_KEEP_MS - 1000), 0);
  assert.equal(purgeTombstones(db, now + TOMBSTONE_KEEP_MS + 1000), 1);
});

test("account deletion deletes the data at once, so the later emptied event finds nothing", () => {
  const db = testDb();
  addHome(db, "e");
  db.prepare("INSERT INTO alexa_tokens VALUES ('a', 'r', 'e', 'x')").run();
  assert.equal(deleteAccountData(db, "e"), true);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM alexa_tokens"), 0);
  handleEntryEvent(db, { type: "emptied", entry: "e" });
  assert.equal(deleteAccountData(db, "e"), false);
});

test("paid date: max kept, cap, grace; a stale phone cannot lower it", () => {
  const db = testDb();
  addHome(db, "e");
  const now = 10 * D;
  assert.equal(homePaid(db, "e", now).paid, false);
  assert.equal(statePaidUntil(db, "e", now + 5 * D, now), now + 5 * D);
  assert.equal(statePaidUntil(db, "e", now + 2 * D, now), now + 5 * D);
  assert.throws(() => statePaidUntil(db, "e", now + MAX_AHEAD_MS + 1, now), PaidDateError);
  assert.throws(() => statePaidUntil(db, "e", "soon", now), PaidDateError);
  assert.throws(() => statePaidUntil(db, "e", 1.5, now), PaidDateError);
  assert.equal(homePaid(db, "e", now + 5 * D + GRACE_MS - 1).paid, true);
  assert.equal(homePaid(db, "e", now + 5 * D + GRACE_MS).paid, false);
  assert.equal(statePaidUntil(db, "nobody", now + D, now), null);
});

test("an unused home is deleted after 180 days; a paid date ahead or a recent touch keeps it", () => {
  const db = testDb();
  const t0 = Date.parse("2026-12-01T00:00:00Z");
  for (const o of ["idle", "paid", "touched", "fresh"]) addHome(db, o);
  db.prepare("UPDATE homes SET created_at = '2026-01-01T00:00:00Z'").run();
  db.prepare("UPDATE homes SET created_at = '2026-11-30T00:00:00Z' WHERE owner_user_id = 'fresh'").run();
  statePaidUntil(db, "paid", t0 + 30 * D, t0 - 200 * D);
  touchHome(db, "touched", t0 - 10 * D);
  assert.equal(purgeUnusedHomes(db, t0), 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes WHERE owner_user_id = 'idle'"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes"), 3);
  touchHome(db, "touched", t0 - 10 * D + 3600_000);
  assert.equal((db.prepare("SELECT last_used_at l FROM homes WHERE owner_user_id = 'touched'").get() as { l: number }).l, t0 - 10 * D, "written at most once a day");
});

test("link code: one use, expires, case-insensitive, rate limited per entry, wrong tries counted", () => {
  resetLinkCodeFailuresForTests();
  const db = testDb();
  const code = makeLinkCode(db, "e", 1000)!;
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(consumeLinkCode(db, code.toLowerCase(), 2000), "e");
  assert.equal(consumeLinkCode(db, code, 2000), null);
  const old = makeLinkCode(db, "e", 1000)!;
  assert.equal(consumeLinkCode(db, old, 1000 + 10 * 60_000 + 1), null);
  for (let i = 0; i < 3; i++) assert.ok(makeLinkCode(db, "e", 1000));
  assert.equal(makeLinkCode(db, "e", 1000), null, "the sixth in an hour is refused");
  assert.ok(makeLinkCode(db, "e", 1000 + 3600_001));
});

test("claim moves the home and the Alexa rows and removes the legacy user; a second claim fails", () => {
  const db = testDb();
  addUser(db, "legacy");
  addHome(db, "legacy");
  db.prepare("INSERT INTO alexa_tokens VALUES ('a', 'r', 'legacy', 'x')").run();
  db.prepare("INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('ac', 's', 'apple', 'legacy', 'a', 'a')").run();
  claimLegacyHome(db, "entry", "legacy");
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes WHERE owner_user_id = 'entry'"), 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM alexa_tokens WHERE user_id = 'entry'"), 1);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM "user"'), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM account"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM deleted_users WHERE user_id = 'legacy'"), 1);
  assert.throws(() => claimLegacyHome(db, "entry", "legacy"), (e: unknown) => e instanceof ClaimError && e.status === 409);
  addUser(db, "l2");
  assert.throws(() => claimLegacyHome(db, "e2", "l2"), (e: unknown) => e instanceof ClaimError && e.status === 404);
});

test("end of the window: unclaimed homes, legacy users, tokens and the emptied tables are all gone", () => {
  const db = testDb();
  addUser(db, "u1");
  addHome(db, "u1");
  db.prepare("INSERT INTO alexa_tokens VALUES ('a', 'r', 'u1', 'x')").run();
  db.prepare("INSERT INTO verification (id, identifier, value, expiresAt) VALUES ('v', 'a@x.test', 'x', 'z')").run();
  db.prepare("INSERT INTO stripe_webhook_events (id, type, received_at) VALUES ('e1', 't', 'z')").run();
  addHome(db, "entry");
  assert.equal(endClaimWindow(db, 4000), 1);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM "user"'), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM alexa_tokens"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM verification"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM stripe_webhook_events"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes"), 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM homes WHERE owner_user_id = 'u1'"), 0);
});
