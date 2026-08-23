# Security Policy

## 対象

最新の`main`と最新Releaseを対象に、認証回避、他世帯の情報や機器へのアクセス、家電tokenや
個人情報の漏えい、任意コード実行など、利用者へ実害が及ぶ脆弱性を受け付けます。

## 非公開で報告する

脆弱性を公開Issueへ書かず、GitHubの
[Private vulnerability reporting](https://github.com/kitepon/yui/security/advisories/new)から報告してください。
再現条件、影響、確認したversionまたはcommitを含めてください。受領後7日以内に一次回答します。

一般的な不具合や対応機種の報告は[GitHub Issues](https://github.com/kitepon/yui/issues)へお願いします。

## 利用上の境界

self-hosted版の運用、TLS、secret管理、バックアップ、LAN内機器の到達範囲は設置者の責任です。
`HOME_SECRETS_KEY`を失うと保存済みtokenは復号できません。公開前に自分の環境で確認してください。
