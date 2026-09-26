import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { beginLogin, issueTicket, redeemTicket, validLoginRequest } from "./ios-relay.server.ts";

test("iPhone login ticket requires its verifier and can be used once", () => {
  const verifier = "v".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = "s".repeat(43);
  assert.equal(validLoginRequest(state, challenge), true);
  assert.equal(validLoginRequest("short", challenge), false);
  beginLogin(state, challenge);
  const code = issueTicket(state, "session-token");
  assert.ok(code);
  assert.equal(redeemTicket(code, verifier), "session-token");
  assert.equal(redeemTicket(code, verifier), null);
  assert.equal(issueTicket(state, "session-token"), null);
});

test("wrong verifier consumes the iPhone login ticket", () => {
  const verifier = "v".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = "t".repeat(43);
  beginLogin(state, challenge);
  const code = issueTicket(state, "session-token");
  assert.ok(code);
  assert.equal(redeemTicket(code, "wrong"), null);
  assert.equal(redeemTicket(code, verifier), null);
});
