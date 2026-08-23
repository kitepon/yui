# 結 — 方針

判断の正本。実装は本書に従う。一般テンプレートや`.grok/skills/auth`と矛盾する箇所は本書を優先する。

## 製品

- 結の本線は Web（`https://yuihome.kitepon.dev`）。ユーザーはそこでアカウントを作り、家を操作する。
- サーバー口は `/api/auth/*` と `/api/home`。Echo からは `/api/alexa`（中は同じ家の操作）。Web も将来の iPhone アプリも `/api/auth/*` と `/api/home` を使う。Echo の解釈は Alexa（Smart Home）。結は機器の実体と操作だけを持つ。
- iPhone アプリは後続の拡張。Cloudflare への実移転と App Store 提出は次の工程。
- サーバーは複数世帯を受け、家電トークンは結のインフラに置く。計算はいま自宅サーバーの Docker。

## 境界

- 認証していない要求は家の状態を読まない・書かない・機器を動かさない。PIN は世帯内の任意ラベルであり、認可ではない。
- 家電トークンの平文はディスクに置かない。応答 JSON に平文を載せない。クライアントは「保存済み」だけを見る。
- 1 ユーザーは 1 家を持つ。家族共有は次の工程。
- 機器の名前と場所は人が付け替えられる。付けた値は `overrides` が正本で、機器そのものの名前を正本にしない。各社の同期は毎回それぞれの元の名前を返すので、保存の入口で当て直す。片方の経路だけ当てると、結の画面と Alexa の呼び名が食い違って戻る。
- 識別は Better Auth のセッション（Cookie または `Authorization: Bearer`）。本番のサインインはメール＋パスワードと、結専用 Google。Grok broker / プレビュー用 OAuth は使わない。Sign in with Apple は iPhone アプリ工程で足す。
- 永続は SQLite 方言だけ（ローカルはファイル、移転先は D1）。Postgres / PGLite / `yui.json` を正本にしない。
- オートメーションの入口は `tickAllHomes()` だけ。ローカルは 60 秒間隔で同じ関数を呼ぶ。Cloudflare では Cron が同じ関数を呼ぶ。プロセス常駐の 20 秒ループと、起きっぱなしの家単位ワーカーを正にしない。
- 時刻オートメーションの粒度は 1 分。比較する時計は `Asia/Tokyo`。センサーは有効なオートメーションがある家だけを起こす。全戸 20 秒ポーリングを正にしない。
- 秘密は環境変数だけに置く。リポジトリと image に入れない。必須は `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`HOME_SECRETS_KEY`。バックアップを使うなら `YUI_BACKUP_URL` と `YUI_BACKUP_SECRET` も。Google で入るなら `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET`。Echo なら `ALEXA_CLIENT_ID` と `ALEXA_CLIENT_SECRET`。
- 公式hosted版は、1つの家あたり月額100円または年額1,000円（税込）、初回30日間無料で提供する。
  Checkout、entitlement、解約はStripeを正とし、料金や契約条件は`src/lib/billing-plan.ts`、
  `/terms`、`/legal`を一致させる。
- self-hosted版はMITで無料、機能制限を設けない。`STRIPE_SECRET_KEY`を設定しなければ課金機能と
  課金ゲートは起動せず、登録した人はそのまま家を操作できる。

## オーデリック（この repo は対応を配布しない / オーナー裁定 2026-08-21）

- オーデリック CONNECTED LIGHTING の制御は、**商品機能として配布しない**。理由は不正競争防止法（技術的制限手段）、著作権（複製・翻案）、アプリ利用規約、製造物責任の 4 面。商品としてのオーデリック対応は公式 Alexa スキルの案内に留める。
- 境界は環境変数ではなく成果物で引く。この repo が持つのは、自作ブリッジへ HTTP を投げる薄い client（`src/lib/home/odelic.ts`）だけで、プロトコルは 1 バイトも入っていない。ブリッジ本体は公開しない。
- `YUI_ODELIC_BRIDGE_URL` を設定しない限り、設定画面にカードは出ず、コネクタは「未設定」を投げる。
- 照明は 1 台ずつ宛先を指して動かす。宛先が分からないときに全灯へ流さない——押した覚えのない照明が動くほうが、動かないより害が大きい。

## 予備（R2）

- 家の SQLite が正本。Cloudflare は家データ（ユーザー行と家。トークンは既に暗号化済み）の予備だけ。
- Google と Stripe は吸わない。復旧後の身分は Google、課金は Stripe をその場で見る。
- 家が 1 時間ごとに暗号化スナップショットを R2 へ押す。復旧は明示の `restore` だけ。壊れているとみなして自動では戻さない。

## Cloudflare 移転で変えてよいもの

- 起動方法（`setInterval` → scheduled handler）
- SQLite ドライバ（`node:sqlite` / libsql → D1 binding）
- 秘密の置き場（サーバー `.env` → Worker secrets）

スキーマ、認可、暗号化、`tickAllHomes` の意味は変えない。
