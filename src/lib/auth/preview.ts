/**
 * Live-preview OAuth client for the sandbox this app was first built in
 * (server-only — NEVER import from the client).
 *
 * Self-hosting does not use this path at all: as soon as `BETTER_AUTH_URL`,
 * `YUI_SQLITE_PATH`, or email/password sign-in is configured, `server.ts` treats
 * the app as a real deployment and ignores these values entirely. Sign in with
 * email/password or Google instead.
 *
 * The credentials are read from the environment so that no shared secret lives
 * in this repository.
 */
export const PREVIEW_CLIENT_ID = process.env.GROK_PREVIEW_CLIENT_ID?.trim() || "";
export const PREVIEW_CLIENT_SECRET = process.env.GROK_PREVIEW_CLIENT_SECRET?.trim() || "";

/** The auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the preview's real origin from the request host and validates it against this
 * list (wildcard-matched).
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
