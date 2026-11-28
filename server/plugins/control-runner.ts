/**
 * 自動制御のタイマーをサーバー起動時に着火する。
 *
 * 本番の着火点はここだけ。`src/routes/api/home.ts` は server と ssr の両方に
 * 入るので、そこで呼ぶと runner が二重になり、名乗りを知らない側が古い値で
 * 上書きする。dev だけ home.ts からも起こす（Nitro プラグインが動かない）。
 * ルートモジュールの初回リクエスト待ちにしない（実測: 再起動後 160 秒間
 * tick せず、リクエストの 9 秒後に再開した）。
 *
 * vite.config.ts の `nitro({ plugins: [...] })` で明示登録している。
 * Nitro v3 beta は server/plugins/ を自動では読まない。
 */
import { definePlugin } from "nitro";
import { initHomeSecrets } from "../../src/lib/server/home-secrets";
import { pushBackup } from "../../src/lib/server/home-backup";
import { startControlRunner } from "../../src/lib/server/runner";

// The home key is unwrapped by the authentication module before the first request and the first tick.
export default definePlugin(async () => {
  const result = await initHomeSecrets();
  startControlRunner();
  // The backup object is encrypted under the home key: after a rotation the next hourly push would leave the old one unreadable for up to an hour.
  if (result === "rotated") void pushBackup().catch((err) => console.error("[yui] backup after key rotation failed", err));
});
