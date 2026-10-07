# 外部仕様の調査記録

- [AlexaアカウントリンクのCookie結合](alexa-redirect-cookies.md) — セッション更新時の転送応答が500になる原因、TanStackの実処理による再現と修理。

- [Alexa「結ホーム」の公開確認](alexa-skill-release.md) — Amazonの公開登録とストアページ、Web・iPhoneの正式スキル導入導線。

- [Tuya Cloud API の機器一覧と DP 応答](tuya-api-response-fields.md) — LAN 鍵・DP番号のフィールド名、20台ページ上限、IoT Core の枠切れ（公式仕様・実測）
- [iPhone の Google 認証](ios-auth.md) — Apple の標準認証画面、Better Auth の OAuth、使い捨てコードと PKCE（公式仕様・実装）
- [iPhoneのApp Store課金](ios-app-store-billing.md) — StoreKitの購入・復元、署名検証、通知、契約状態の再取得（Appleの公式仕様）
- [iPhone版の審査準備](ios-app-store-review.md) — 課金表示、無料体験、アカウント削除、Appleログイン解除、プライバシー申告、Apple・Googleのログイン表示基準、審査待ちのビルド差し替え（公式仕様・画面・API実測）
- [iOSの配布署名とTestFlightの内部テスト](ios-testflight-distribution.md) — 手動プロファイル取得、内部配布、ビルド4・5での署名と配布の実測。原文抜粋: [Appleの配布手順](ios-testflight/raw/apple-distribution-excerpts.md)。
- [StoreKitのローカル試験](ios-storekit-local-testing.md) — 購入処理7件と強制終了後の復帰2ケース、購入予約の保存と再開、Apple署名と画面操作の確認範囲。

- [Smart LifeのLAN操作と状態反映](tuya-lan-state.md) — 3.1の受領応答・状態通知、TCP接続と状態保存の競合、実機の読取・操作時間、修理と検証。

# Mac Catalyst

- [mac-catalyst-launch-verification.md](mac-catalyst-launch-verification.md) — iPad・Macの同一アプリ登録、署名と画面写真の要件、SwiftインタープリターのDYLD環境で検証用起動が失敗する再現・比較。
