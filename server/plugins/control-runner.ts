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
import { startControlRunner } from "../../src/lib/server/runner";

export default definePlugin(() => {
  startControlRunner();
});
