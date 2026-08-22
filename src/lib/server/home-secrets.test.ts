import assert from "node:assert/strict";
import { test } from "node:test";
import {
  credentialFlags,
  decryptJson,
  encryptJson,
  mergeIncomingCredentials,
  publicCredentials,
  secretsKeyFromEnv,
} from "./home-secrets.ts";

const empty = publicCredentials();
const key = secretsKeyFromEnv("0".repeat(64));

test("32-byte hex key", () => {
  assert.equal(secretsKeyFromEnv("ab".repeat(32)).length, 32);
});

test("encrypt roundtrip", () => {
  const packed = encryptJson(key, { natureToken: "secret-token" });
  assert.equal(packed.includes("secret-token"), false);
  assert.deepEqual(decryptJson(key, packed), { natureToken: "secret-token" });
});

test("empty incoming credentials do not wipe stored tokens", () => {
  const stored = { ...empty, natureToken: "keep-me" };
  const next = mergeIncomingCredentials(stored, { ...empty });
  assert.equal(next.natureToken, "keep-me");
});

test("public credentials are empty and flags mark saved secrets", () => {
  const stored = { ...empty, switchbotToken: "tok", switchbotSecret: "sec" };
  const pub = publicCredentials();
  assert.equal(pub.switchbotToken, "");
  assert.equal(credentialFlags(stored).switchbotToken, true);
  assert.equal(credentialFlags(stored).natureToken, false);
  assert.equal(credentialFlags({ ...empty, tuyaRegion: "us" }).tuyaRegion, false);
});
