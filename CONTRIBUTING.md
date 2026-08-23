# 結 Yuiへの貢献

不具合報告、対応機種の実測結果、文書改善、修正提案を歓迎します。

## Issue

先に既存Issueを検索し、再現手順、期待した結果、実際の結果、環境、対象機器を記載してください。
家電token、住所、メールアドレス、Stripe情報、server log内のsecretは載せないでください。
脆弱性は公開Issueではなく[SECURITY.md](SECURITY.md)の非公開窓口へ送ってください。

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
