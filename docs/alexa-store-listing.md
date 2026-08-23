# 結ホーム — Alexa スキル公開情報（審査提出用の正本）

開発者コンソールの「公開情報」「プライバシーとコンプライアンス」「テスト手順」へ
貼る文言の正本。ここを直してからコンソールへ写す。審査用アカウントのパスワードは
リポジトリに置かず、コンソールのテスト手順欄にだけ書く。

## 公開情報（ja-JP）

- 公開名: 結ホーム
- 一文の説明: 結につないだ家の機器を、Alexaの声で操作します。
- 詳細な説明:

  結（ゆい）は、Nature Remo、SwitchBot、Smart Lifeなど複数の家電サービスを
  一つの画面にまとめるホームアプリです。このスキルを結のアカウントと
  リンクすると、結に登録した照明・エアコン・プラグ・カーテン・鍵・場面を、
  Echoから普段の機器名でそのまま操作できます。

  ご利用には結のアカウントが必要です（30日間無料体験、以降は月額100円）。
  https://yuihome.kitepon.dev/ から登録できます。

- 発話例（3つ・審査で実際に試される）:
  1. アレクサ、デバイスを探して
  2. アレクサ、プラグをつけて
  3. アレクサ、プラグを消して
- カテゴリー: スマートホーム
- キーワード: スマートホーム,家電,照明,エアコン,Nature Remo,SwitchBot
- アイコン: `docs/assets/alexa/yui-home-alexa-512.png` / `-108.png`（正本。行灯の写真調イラスト・Grok生成）。
  `-alt-1024.png` は「光の糸が結ばれる」別案。小サイズで潰れるためアイコンには使わず、
  製品ページ・OG などの大きく見せる場面の素材として保管

## プライバシーとコンプライアンス

- プライバシーポリシー URL: https://yuihome.kitepon.dev/privacy
- 利用規約 URL: https://yuihome.kitepon.dev/terms
- 広告を含むか: いいえ
- 13歳未満対象か: いいえ
- 購入・実通貨の取引を含むか: いいえ（課金は結のサイト側で完結し、スキル内購入は無い）
- 個人情報を収集するか: はい（アカウントリンクのため。ポリシーに記載）

## テスト手順（Testing instructions・英語でコンソールへ）

    This is a smart home skill for Yui (https://yuihome.kitepon.dev/), a home
    control app that aggregates Nature Remo / SwitchBot / Smart Life devices.

    Test account (pre-provisioned, no payment required):
      Email:    alexa-review@kitepon.dev
      Password: <コンソールにだけ書く。repo に置かない>

    1. Enable the skill and link the account with the credentials above
       (email/password login on the Yui login page).
    2. Say "アレクサ、デバイスを探して" (or run device discovery in the Alexa
       app) — one smart plug named "電気" (a real SwitchBot plug, powered 24/7)
       will be discovered.
    3. Say "アレクサ、電気を消して" / "アレクサ、電気をつけて" to control it.
       This is the sample phrase shown in the store listing.
       State report is supported (the Alexa app shows ON/OFF).

    The plug is a physical device in the developer's home and stays reachable
    for the whole certification period.

## 審査用アカウントの実体（運用メモ）

- email: `alexa-review@kitepon.dev`（`YUI_BILLING_EXEMPT` で課金免除）
- 家の中身: SwitchBot プラグ1台だけ（名前「電気」、部屋「テスト」）。場面なし
  - 名前を「電気」にしたのは、ストアのサンプルフレーズ「アレクサ、電気を消して」を
    審査員がそのまま試すため。実体は水槽のライトの電源なので表示に嘘はない
  - kind は plug のまま（light にすると Alexa へ調光能力を申告してしまい、
    プラグは調光できないので別の失敗を招く）
- サーバー側の SwitchBot 認証情報は本物。審査員が押すと実物のプラグが動く
- 審査が終わったら: `YUI_BILLING_EXEMPT` から外すか、アカウントごと残すかを決める
