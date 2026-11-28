import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { storedHomeKey } from "./home-key.ts";
import { decryptJson, encryptJson, initHomeSecrets, resetHomeSecretsForTests, secretsKeyFromEnv } from "./home-secrets.ts";

const OLD = "ab".repeat(32);
const ENV = { YUI_AUTH_SOCK: "/x.sock", HOME_SECRETS_KEY: OLD } as never;

function db() {
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../../../migrations/sqlite/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) d.exec(readFileSync(new URL(f, dir), "utf8"));
  return d;
}
/** A module that wraps by base64 (the real one is a socket) and remembers what it wrapped. */
function fakeModule() {
  const calls: string[] = [];
  return {
    calls,
    wrap: async (_s: string, hex: string, aad: string) => { calls.push("wrap:" + aad); return Buffer.from(hex + "|" + aad).toString("base64"); },
    unwrap: async (_s: string, blob: string, aad: string) => {
      calls.push("unwrap:" + aad);
      const [hex, a] = Buffer.from(blob, "base64").toString().split("|");
      if (a !== aad) throw new Error("aad");
      return hex!;
    },
  };
}
function seed(d: DatabaseSync, key: string) {
  d.exec("INSERT INTO \"user\" VALUES ('u1','n','e@x',0,NULL,'a','a')");
  d.prepare("INSERT INTO homes (id, owner_user_id, pair_pin, credentials_enc, body_json, has_enabled_automation, created_at, updated_at) VALUES ('h1','u1','1',?,'{}',0,'a','a')")
    .run(encryptJson(secretsKeyFromEnv(key), { natureToken: "t1" }));
  d.prepare("INSERT INTO apple_login_tokens VALUES ('u1', ?, 'a')").run(encryptJson(secretsKeyFromEnv(key), { refreshToken: "r1" }));
}

test("no module socket: the environment key is used as before", async () => {
  resetHomeSecretsForTests();
  assert.equal(await initHomeSecrets({ HOME_SECRETS_KEY: OLD } as never), "env");
});

test("rotation re-encrypts every home and Apple token under a new key and wraps only the new key", async () => {
  resetHomeSecretsForTests();
  const d = db();
  seed(d, OLD);
  const m = fakeModule();
  assert.equal(await initHomeSecrets({ ...ENV, YUI_ROTATE_HOME_KEY: "1" } as never, m, d), "rotated");
  const key = secretsKeyFromEnv();
  assert.notEqual(key.toString("hex"), OLD);
  const home = d.prepare("SELECT credentials_enc c FROM homes").get() as { c: string };
  assert.deepEqual(decryptJson(key, home.c), { natureToken: "t1" });
  assert.throws(() => decryptJson(secretsKeyFromEnv(OLD), home.c), "the old key no longer opens it");
  const tok = d.prepare("SELECT refresh_token_enc t FROM apple_login_tokens").get() as { t: string };
  assert.deepEqual(decryptJson(key, tok.t), { refreshToken: "r1" });
  assert.equal(storedHomeKey(d)?.aad, "yuihome:home-secrets-v2");
  assert.deepEqual(m.calls, ["wrap:yuihome:home-secrets-v2"]);
  resetHomeSecretsForTests();
});

test("a start after the rotation unwraps the stored key and does not need the old one", async () => {
  resetHomeSecretsForTests();
  const d = db();
  seed(d, OLD);
  const m = fakeModule();
  await initHomeSecrets({ ...ENV, YUI_ROTATE_HOME_KEY: "1" } as never, m, d);
  const rotated = secretsKeyFromEnv().toString("hex");
  resetHomeSecretsForTests();
  assert.equal(await initHomeSecrets({ YUI_AUTH_SOCK: "/x.sock" } as never, m, d), "module");
  assert.equal(secretsKeyFromEnv().toString("hex"), rotated);
  assert.equal(await initHomeSecrets({ ...ENV, YUI_ROTATE_HOME_KEY: "1" } as never, m, d), "module", "the flag is ignored once a key is stored");
  resetHomeSecretsForTests();
});

test("a second copy of this file (the build makes one per server chunk) sees the unwrapped key", async () => {
  resetHomeSecretsForTests();
  const d = db();
  seed(d, OLD);
  await initHomeSecrets({ ...ENV, YUI_ROTATE_HOME_KEY: "1" } as never, fakeModule(), d);
  const copy = (await import("./home-secrets.ts?copy")) as typeof import("./home-secrets.ts");
  assert.equal(copy.secretsKeyFromEnv().toString("hex"), secretsKeyFromEnv().toString("hex"));
  assert.notEqual(copy.secretsKeyFromEnv().toString("hex"), OLD);
  resetHomeSecretsForTests();
});

test("when the module fails nothing changes: the old key stays in use and the data is untouched", async () => {
  resetHomeSecretsForTests();
  const d = db();
  seed(d, OLD);
  const fail = { wrap: async () => { throw new Error("down"); }, unwrap: async () => { throw new Error("down"); } };
  assert.equal(await initHomeSecrets({ ...ENV, YUI_ROTATE_HOME_KEY: "1" } as never, fail, d), "env");
  assert.equal(storedHomeKey(d), undefined);
  const home = d.prepare("SELECT credentials_enc c FROM homes").get() as { c: string };
  assert.deepEqual(decryptJson(secretsKeyFromEnv(OLD), home.c), { natureToken: "t1" });
  await assert.rejects(initHomeSecrets({ YUI_AUTH_SOCK: "/x.sock" } as never, fail, d), "without the old key in the environment the start fails");
  resetHomeSecretsForTests();
});

test("a rotation that breaks halfway rolls back whole", async () => {
  resetHomeSecretsForTests();
  const d = db();
  seed(d, OLD);
  d.prepare("UPDATE apple_login_tokens SET refresh_token_enc = 'not-ciphertext'").run();
  const m = fakeModule();
  assert.equal(await initHomeSecrets({ ...ENV, YUI_ROTATE_HOME_KEY: "1" } as never, m, d), "env");
  const home = d.prepare("SELECT credentials_enc c FROM homes").get() as { c: string };
  assert.deepEqual(decryptJson(secretsKeyFromEnv(OLD), home.c), { natureToken: "t1" }, "the homes were not left on the new key");
  assert.equal(storedHomeKey(d), undefined);
  resetHomeSecretsForTests();
});
