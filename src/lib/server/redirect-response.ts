/** セッションCookieを結合するサーバー処理へ、変更可能なヘッダーを渡す。 */
export function redirectResponse(destination: string | URL): Response {
  return new Response(null, { status: 302, headers: { location: String(destination) } });
}
