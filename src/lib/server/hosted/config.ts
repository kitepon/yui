export const HOSTED_APP_ID = "dev.kitepon.yuihome";

/** The hosted build (yuihome.kitepon.dev). Off: self-hosted, no library is loaded. */
export function hostedEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.YUI_HOSTED?.trim() === "1";
}

/** scheme://host[:port] of the server, as the library wants it. */
export function hostedOrigin(env: NodeJS.ProcessEnv = process.env) {
  const url = env.BETTER_AUTH_URL?.trim();
  if (!url) throw new Error("BETTER_AUTH_URL が無い");
  return new URL(url).origin;
}
