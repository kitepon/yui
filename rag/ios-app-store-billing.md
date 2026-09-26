# Appleの自動更新サブスクリプション

調査対象はAppleの一次資料。StoreKit 2の`Product.purchase(options:)`で`appAccountToken`を取引に付け、`VerificationResult<Transaction>`のJWSをサーバーへ渡す。`Transaction.updates`を監視し、サーバー保存後に`finish()`する。復元は`AppStore.sync()`と`Transaction.currentEntitlements`を使う。

- [StoreKit Transaction](https://developer.apple.com/documentation/storekit/transaction)
- [Product.purchase(options:)](https://developer.apple.com/documentation/storekit/product/purchase%28options%3A%29)
- [App Store Server Library for Node](https://github.com/apple/app-store-server-library-node/blob/main/README.md) — `SignedDataVerifier`、Appleルート証明書、`AppStoreServerAPIClient`。
- [App Store Server Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications/receiving-app-store-server-notifications) — 署名付き通知と取引・更新情報。
- [Get All Subscription Statuses](https://developer.apple.com/documentation/appstoreserverapi/get-all-subscription-statuses) — 明示的な契約状態の再取得。
- [Apple PKI](https://www.apple.com/certificateauthority/) — JWS検証に使う公開ルート証明書。
- [App Store Server API用の鍵](https://developer.apple.com/documentation/appstoreserverapi/creating-api-keys-to-authorize-api-requests) — App Store Connect API用の鍵とは別のIn-App Purchase鍵を作る。
- [App Store Connect APIのApps](https://developer.apple.com/documentation/appstoreconnectapi/apps) — 新規アプリレコードはAPIから作れず、Web画面で作る。

結の実装では、サーバーが署名、Bundle ID、Apple ID、商品ID、ユーザー識別子、有効期限、返金、猶予期間を検証する。通知の識別子で重複処理を避け、通知時刻と状態取得時刻で古い状態への巻き戻りを防ぐ。StripeとAppleの有効契約はいずれも同じ操作権限を与える。

Appleの`PurchaseResult.pending`は、承認されると`Transaction.updates`へ届く。[Appleの説明](https://developer.apple.com/documentation/storekit/product/purchaseresult/pending)による。Ask to Buyが否認された場合は取引が届かないため、アプリから否認完了を確実には検出できない（[Appleのテスト手順](https://developer.apple.com/documentation/storekit/testing-ask-to-buy-in-xcode)）。結は二重購入を避けるためAppleの購入予約を保持し、解決しない場合はサポートが確認する。
