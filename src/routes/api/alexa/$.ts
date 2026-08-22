import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { handleAlexaEvent } from "@/lib/server/alexa";
import type { AlexaEvent } from "@/lib/server/alexa-core";
import { handleAlexaCustom } from "@/lib/server/alexa-custom";
import { allowedAlexaRedirect } from "@/lib/server/alexa-core";
import { publicOrigin } from "@/lib/server/origin";
import {
  alexaOAuthConfigured,
  consumeAlexaCode,
  issueAlexaCode,
  issueAlexaTokens,
  refreshAlexaTokens,
  verifyAlexaClient,
} from "@/lib/server/alexa-oauth";

async function readTokenBody(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return (await request.json()) as Record<string, string>;
  }
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;
}

function clientFromBasic(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return {};
  const decoded = atob(header.slice(6));
  const i = decoded.indexOf(":");
  if (i < 0) return {};
  return { client_id: decoded.slice(0, i), client_secret: decoded.slice(i + 1) };
}

async function authorize(request: Request) {
  if (!alexaOAuthConfigured()) return new Response("Alexa が未設定です", { status: 503 });
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const responseType = url.searchParams.get("response_type") ?? "";
  if (responseType !== "code" || !verifyAlexaClient(clientId) || !allowedAlexaRedirect(redirectUri)) {
    return new Response("認可の要求が不正です", { status: 400 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    const next = `/api/alexa/oauth/authorize${url.search}`;
    return Response.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, publicOrigin()), 302);
  }
  const code = issueAlexaCode(session.user.id, redirectUri);
  const dest = new URL(redirectUri);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return Response.redirect(dest, 302);
}

async function token(request: Request) {
  if (!alexaOAuthConfigured()) return Response.json({ error: "invalid_client" }, { status: 401 });
  const body = await readTokenBody(request);
  const basic = clientFromBasic(request);
  const clientId = body.client_id || basic.client_id || "";
  const clientSecret = body.client_secret || basic.client_secret || "";
  if (!verifyAlexaClient(clientId, clientSecret)) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }
  if (body.grant_type === "authorization_code") {
    const userId = consumeAlexaCode(body.code ?? "", body.redirect_uri ?? "");
    if (!userId) return Response.json({ error: "invalid_grant" }, { status: 400 });
    return Response.json(issueAlexaTokens(userId));
  }
  if (body.grant_type === "refresh_token") {
    const tokens = refreshAlexaTokens(body.refresh_token ?? "");
    if (!tokens) return Response.json({ error: "invalid_grant" }, { status: 400 });
    return Response.json(tokens);
  }
  return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
}

async function skill(request: Request) {
  if (!alexaOAuthConfigured()) return Response.json({ error: "Alexa が未設定です" }, { status: 503 });
  const event = (await request.json()) as AlexaEvent;
  return Response.json(await handleAlexaEvent(event));
}

function alexaPath(request: Request) {
  return new URL(request.url).pathname.replace(/^\/api\/alexa\/?/, "");
}

export const Route = createFileRoute("/api/alexa/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (alexaPath(request) === "oauth/authorize") return authorize(request);
        return new Response("Not Found", { status: 404 });
      },
      POST: async ({ request }) => {
        const path = alexaPath(request);
        if (path === "oauth/token") return token(request);
        if (path === "smart-home") return skill(request);
        if (path === "custom") {
          if (!alexaOAuthConfigured()) return Response.json({ error: "Alexa が未設定です" }, { status: 503 });
          return Response.json(await handleAlexaCustom(await request.json()));
        }
        return new Response("Not Found", { status: 404 });
      },
    },
  },
});
