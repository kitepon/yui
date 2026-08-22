/**
 * 自動制御のタイマーをサーバー起動時に着火する。
 *
 * `startControlRunner()` は src/routes/api/home.ts からも呼ぶが、ビルド後の
 * ルートモジュールは初回リクエストまで読み込まれない。それだけに任せると、
 * 再起動後に誰かがアプリを開くまでセンサー監視も時刻トリガーも動かない
 * （実測: 再起動後 160 秒間 1 度も tick せず、リクエストを 1 回送った
 * 9 秒後に再開した）。Nitro プラグインは起動時に必ず実行されるので、
 * ここを正規の着火点にする。
 *
 * vite.config.ts の `nitro({ plugins: [...] })` で明示登録している。
 * Nitro v3 beta は server/plugins/ を自動では読まない。
 */
import { definePlugin } from "nitro";
import { startControlRunner } from "../../src/lib/server/runner";

export default definePlugin(() => {
  startControlRunner();
});
