import assert from "node:assert/strict";
import { test } from "node:test";
import {
  credentialFlags,
  decryptJson,
  encryptJson,
  mergeIncomingCredentials,
  normalizeCredentials,
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

test("tuyaLocal は同期が 1 件以上渡したときだけ差し替わり、クライアントの空は無視する。古い行には空で埋まる", () => {
  const local = { eb70: { localKey: "0123456789abcdef", dps: { "1": "va_temperature" } } };
  const stored = mergeIncomingCredentials(empty, { tuyaAccessId: "id", tuyaLocal: local });
  assert.deepEqual(stored.tuyaLocal, local);
  const afterClient = mergeIncomingCredentials(stored, { ...publicCredentials(), tuyaSecret: "s" });
  assert.deepEqual(afterClient.tuyaLocal, local);
  assert.equal(afterClient.tuyaSecret, "s");
  const legacy = normalizeCredentials({ natureToken: "n" });
  assert.deepEqual(legacy.tuyaLocal, {});
  assert.equal(credentialFlags(stored).tuyaLocal, true);
  assert.equal(credentialFlags(empty).tuyaLocal, false);
  assert.deepEqual(publicCredentials().tuyaLocal, {}, "鍵はクライアントへ出さない");
});
