# 結 — Alexa

Echo は耳。解釈は Alexa。結は家の機器を Discover して動かすだけ（ダイキンと同じ Smart Home）。

呼び方は **「アレクサ、電気消して」**。スキル名は要らない。

## 結側（済み）

- 認可: `https://<自分のホスト>/api/alexa/oauth/authorize`
- トークン: `https://<自分のホスト>/api/alexa/oauth/token`
- Smart Home: `https://<自分のホスト>/api/alexa/smart-home`（Lambda から転送）
- Lambda: `deploy/alexa-lambda.mjs`。日本語スキルのリージョンは **us-west-2**
- 秘密: `ALEXA_CLIENT_ID` / `ALEXA_CLIENT_SECRET`
- Send Alexa Events はオフ。`AcceptGrant` は応答するが、Alexa Event Gateway は使わない

機器の出し方:

| 結 | Alexa | 例 |
|---|---|---|
| 照明 | LIGHT | 電気消して、シーリングつけて |
| エアコン | THERMOSTAT | エアコンつけて、22度にして、暖房にして |
| カーテン | INTERIOR_BLIND | カーテン開けて |
| コンセント / ボット / 赤外線 | SMARTPLUG / SWITCH | つけて、消して |
| 鍵 | SMARTLOCK | 鍵閉めて |
| 場面 | SCENE_TRIGGER | おはようをつけて |

Custom `/api/alexa/custom` は残してあるが本線ではない。

## Amazon 側（開発者コンソールで登録する）

| もの | 値 |
|---|---|
| スキル | 結ホーム（スマートホーム / ja-JP） |
| スキル ID | `<自分のスキル ID>` |
| ベンダー ID | `<自分のベンダー ID>` |
| ペイロード | v3 |
| Lambda | `arn:aws:lambda:us-west-2:<自分の AWS アカウント>:function:yuihome-alexa`（自分の AWS アカウント） |
| Lambda のトリガー | Alexa Smart Home、上のスキル ID |
| 認可 URI | `https://<自分のホスト>/api/alexa/oauth/authorize` |
| トークン URI | `https://<自分のホスト>/api/alexa/oauth/token` |
| Client ID | `<自分で決める Client ID>` |
| スコープ | `home`（結は検証しない） |
| リダイレクト URL | pitangui.amazon.com / layla.amazon.com / alexa.amazon.co.jp の `/api/skill/link/<自分のベンダー ID>` と `/spa/skill/account-linking-status.html?vendorId=<自分のベンダー ID>` |

上記はすべて設定済みで、クオの Echo で実運用している（シークレット登録・アカウントリンク・デバイス検出まで完了）。

## 公開審査（2026-08-23 提出）

公式スキル「結ホーム」を Amazon の認定審査へ提出した（ステータス: 審査中）。

- 提出物（説明文・発話例・テスト手順）の正本は [alexa-store-listing.md](alexa-store-listing.md)
- 審査用アカウント: `alexa-review@kitepon.dev`。課金はサーバー `.env` の `YUI_BILLING_EXEMPT` で免除
- 審査用デバイスはクオ家の SwitchBot プラグ1台（名前「電気」）。審査中は負荷を抜き、
  審査期間中オンラインを維持する（Amazon の要件）
- 審査が通ったら: kitepon.dev と README に Echo 対応の記載を戻す。落ちたら指摘へ対応して再提出

Lambda のタイムアウトは **8 秒**（Alexa の上限）。既定の 3 秒では、Smart Life の操作（トークン→状態→コマンドの 3 往復）が入りきらない。

## 機器を入れ直す（再検出）

結で機器を足したり名前を変えたりしても、Alexa は自分から気付かない。
`proactivelyReported` はすべて false で、Alexa Event Gateway も使っていないため、
**Alexa 側からもう一度取りに来させる**必要がある。

- 声が確実: **「アレクサ、デバイスを探して」**。アプリの画面構成に左右されない
- アプリから: デバイス → ＋ → デバイスを追加 → その他 → デバイスを検出（20〜45 秒かかる）

注意が 2 つある。

- **Alexa アプリ側で名前を変えた機器は、結の名前で上書きされない。** Alexa は利用者が付けた名前を優先する。その場合は Alexa アプリ側で直す
- 機器が増えないときはスキルの接続を疑う。その他 → スキル・ゲーム → 有効なスキル → 「結ホーム」があるか

## 通らないときに見る所

- Lambda の CloudWatch ログ（`/aws/lambda/yuihome-alexa`）に結の応答がそのまま出る
- `invalid_client` → クライアントシークレットが Amazon 側と `.env` で食い違っている
- ログイン画面から Amazon へ戻らない → `/login?next=` を落としている
- 機器が 1 台も出ない → 結の機器が `source: "live"` でない（デモ機器は Alexa へ出さない）
- 特定の機器だけ動かない → 接続先ごとに実装が違う。Nature Remo は ac・light・ir、SwitchBot は plug・bot・curtain・lock、Smart Life は switch 系コードを持つ機器だけ。それ以外は黙って成功を返さずエラーを出す
- 名前が古いまま → 再検出していないか、Alexa アプリ側で名前を変えたことがある（そちらが優先される）
- オーデリック照明が出ない → 自宅の image だけの機能。`YUI_ODELIC_BRIDGE_URL` が要る。`kind: "light"` なので、機器として在れば Alexa には自動で出る

## やらない

- 機器ごとの発話サンプルを Alexa に置くこと
- Google
- 解釈を結に戻すこと（Custom 呼び出し名が要る）
