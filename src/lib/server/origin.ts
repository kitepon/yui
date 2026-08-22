/** 外に出す URL の素。プロキシ越しの request.url は http なので、公開オリジンを正とする。 */
export function publicOrigin() {
  return (process.env.BETTER_AUTH_URL ?? "https://yuihome.kitepon.dev").replace(/\/$/, "");
}
