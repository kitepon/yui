import { createFileRoute } from "@tanstack/react-router";
import { auth, SESSION_TOKEN_COOKIE } from "@/lib/auth/server";
import { beginLogin, cancelLogin, issueTicket, redeemTicket, validLoginRequest } from "@/lib/auth/ios-relay.server";

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function appCallback(state: string, code?: string): Response {
  const url = new URL("yuihome://auth");
  url.searchParams.set("state", state);
  url.searchParams.set(code ? "code" : "error", code ?? "google_sign_in_failed");
  return noStore(Response.redirect(url, 302));
}

function sessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const part = item.trim();
    const equal = part.indexOf("=");
    if (equal > 0 && part.slice(0, equal) === SESSION_TOKEN_COOKIE) {
      try {
        return decodeURIComponent(part.slice(equal + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function start(request: Request, url: URL): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const challenge = url.searchParams.get("challenge") ?? "";
  if (!validLoginRequest(state, challenge)) {
    return noStore(new Response("Invalid login request", { status: 400 }));
  }
  beginLogin(state, challenge);
  const callback = new URL("/api/ios-auth", url.origin);
  callback.searchParams.set("step", "finish");
  callback.searchParams.set("state", state);
  try {
    const result = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: callback.toString(),
        errorCallbackURL: callback.toString(),
        disableRedirect: true,
      },
      headers: request.headers,
      asResponse: true,
    });
    if (!result.ok) {
      cancelLogin(state);
      console.error("[ios-auth] Google login start HTTP", result.status);
      return noStore(new Response("Google login unavailable", { status: 503 }));
    }
    const payload = (await result.json()) as { url?: string };
    if (!payload.url) {
      cancelLogin(state);
      console.error("[ios-auth] Google login start missing URL");
      return noStore(new Response("Google login unavailable", { status: 503 }));
    }
    const response = noStore(Response.redirect(payload.url, 302));
    for (const cookie of result.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch (error) {
    cancelLogin(state);
    console.error("[ios-auth] Google login start failed", error);
    return noStore(new Response("Google login unavailable", { status: 503 }));
  }
}

async function finish(request: Request, url: URL): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) {
    return noStore(new Response("Invalid login request", { status: 400 }));
  }
  if (url.searchParams.has("error")) {
    cancelLogin(state);
    return appCallback(state);
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const token = session ? sessionToken(request) : null;
  if (!token) {
    cancelLogin(state);
    return appCallback(state);
  }
  const code = issueTicket(state, token);
  return appCallback(state, code ?? undefined);
}

async function exchange(request: Request): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return noStore(Response.json({ error: "Invalid login request" }, { status: 400 }));
  }
  if (!input || typeof input !== "object") {
    return noStore(Response.json({ error: "Invalid login request" }, { status: 400 }));
  }
  const { code, verifier } = input as Record<string, unknown>;
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code) ||
      typeof verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) {
    return noStore(Response.json({ error: "Invalid login request" }, { status: 400 }));
  }
  const token = redeemTicket(code, verifier);
  if (!token) return noStore(Response.json({ error: "Login expired" }, { status: 400 }));
  return noStore(Response.json({ token }));
}

export const Route = createFileRoute("/api/ios-auth")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        return url.searchParams.get("step") === "finish" ? finish(request, url) : start(request, url);
      },
      POST: ({ request }) => exchange(request),
    },
  },
});
