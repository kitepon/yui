import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeResponse, setCookie, withStartRequest } from "../../../node_modules/@tanstack/start-server-core/dist/esm/internal-request-response.js";
import { redirectResponse } from "./redirect-response.ts";

test("Alexaへ戻るリダイレクトにセッションCookieを結合しても302を返す", async () => {
  const destination = new URL("https://alexa.amazon.co.jp/account-linking-status");
  destination.searchParams.set("code", "test-code");
  destination.searchParams.set("state", "test-state");
  // The Start pipeline merges helper cookies into the returned response (finalizeResponse), as the server does.
  const handler = withStartRequest(async (_request, _opts, event) => {
    setCookie("session_probe", "test-only");
    return finalizeResponse(redirectResponse(destination), event);
  });
  const response = await handler(new Request("http://localhost/api/alexa/oauth/authorize"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), destination.href);
  assert.ok(response.headers.getSetCookie().some(cookie => cookie.startsWith("session_probe=test-only")));
});
