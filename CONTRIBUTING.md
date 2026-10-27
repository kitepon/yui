# 結 Yuiへの貢献

不具合報告、対応機種の実測結果、文書改善、修正提案を歓迎します。

## Issue

先に既存Issueを検索し、再現手順、期待した結果、実際の結果、環境、対象機器を記載してください。
対応機種の報告には、コネクタ名（Nature Remo / SwitchBot / Smart Life / ダイキン）、
Tuya なら `category`、SwitchBot なら `deviceType`、できた操作とできなかった操作を書いてください。
Smart Life の通信不具合では、機器カードの `LAN` / `LAN不可` 表示、接続タブのローカル版と失敗理由、同じ LAN で他の機器が読めるかも添えてください。
家電token、住所、メールアドレス、Stripe情報、server log内のsecretは載せないでください。
脆弱性は公開Issueではなく[SECURITY.md](SECURITY.md)の非公開窓口へ送ってください。

通信不良そのものはバグとして扱いません。[通信不良時の方針](docs/00_direction.md#通信不良を前提にした動作オーナー裁定-2026-10-27)に従い、待機や回復後の復帰が不適切な場合は、通信不良中と回復後のアプリの動作を報告・検証してください。通信不良でも全機能を動かすことは要求しません。

## Pull request

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build:dev
```

変更の理由と確認方法を本文へ書き、機能追加は対象利用者と既存の製品境界を説明してください。
オーデリックのprotocolやbridge本体は受け付けません。
