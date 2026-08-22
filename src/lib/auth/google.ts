/** 結専用 Google。Grok broker は使わない。 */
export function googleAuthConfigured(
  env: NodeJS.Dict<string> = process.env,
): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}
