import assert from "node:assert/strict";
import { test } from "node:test";
import { googleAuthConfigured } from "./google.ts";

test("google is off without both env vars", () => {
  assert.equal(googleAuthConfigured({}), false);
  assert.equal(googleAuthConfigured({ GOOGLE_CLIENT_ID: "id" }), false);
  assert.equal(googleAuthConfigured({ GOOGLE_CLIENT_SECRET: "sec" }), false);
  assert.equal(
    googleAuthConfigured({ GOOGLE_CLIENT_ID: "  ", GOOGLE_CLIENT_SECRET: "sec" }),
    false,
  );
});

test("google is on when both env vars are set", () => {
  assert.equal(
    googleAuthConfigured({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "sec" }),
    true,
  );
});
