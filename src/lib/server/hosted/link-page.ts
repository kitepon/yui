const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The Alexa linking page on hosted: one box for the code the Yui app shows (Settings > Alexa). It keeps nothing in the browser. */
export function linkCodePage(search: string, error = "") {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>結を Alexa につなぐ</title>
<body style="font-family:system-ui;max-width:28rem;margin:2rem auto;padding:0 1rem">
<h1>結を Alexa につなぐ</h1>
<p>結のアプリの「設定 → Alexa」で出したコード（8文字）を入れてください。コードは10分で切れます。</p>
${error ? `<p role="alert" style="color:#b00020">${esc(error)}</p>` : ""}
<form method="post" action="/api/alexa/oauth/authorize">
<input type="hidden" name="query" value="${esc(query)}">
<input name="code" autocomplete="off" autocapitalize="characters" maxlength="8" required style="font-size:1.5rem;letter-spacing:.2em;width:100%">
<button style="margin-top:1rem;font-size:1.1rem">つなぐ</button>
</form></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
