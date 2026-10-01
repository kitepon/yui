# 結 iPhone

SwiftUI 製のネイティブアプリ。接続先は `https://yuihome.kitepon.dev`。
現在の実装範囲と残る確認は [`../docs/plan_iphone.md`](../docs/plan_iphone.md)。

```bash
cd ios
xcodegen generate
xcodebuild -project Yui.xcodeproj -scheme Yui -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO build
```

既存の結アカウントは Google ボタンからログインする。メールとパスワードを登録した
アカウントはその入力欄でも入れる。認証結果は iOS 標準の認証画面からアプリへ戻り、
一度だけ使えるコードをサーバーでセッションに引き換える。

実機へのビルドと導入は [INSTALL-DEVICE.md](INSTALL-DEVICE.md)。App Store提出とTestFlight配布の現在地は [課金設定と審査記録](../docs/apple-billing-setup.md) を参照する。

## 購入処理の自動試験

`YuiBilling`テストプランは、StoreKitのローカル商品と試験用HTTP応答を使い、アプリ本体の`SessionStore`と`YuiClient`をシミュレーター上で実行する。Apple Accountの入力や実機の操作は要らない。

```bash
cd ios
xcodegen generate
xcodebuild -project Yui.xcodeproj -scheme Yui -testPlan YuiBilling \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO test
```

所属不一致後の予約解除と再購入、購入成功、キャンセル、承認待ちと承認後の反映、取引登録の通信失敗、セッション再作成後の復元、保存Cookieがある状態でのBearer認証を確認する。

StoreKit設定はテストプランとテスト用bundleにだけ置く。通常の起動と配布アプリはApp Storeの商品を使う。HTTPは試験内で置き換えるため、本番の契約・予約・利用者情報は変更しない。Apple署名のサーバー検証と通知、アプリの強制終了からの復帰は、この試験の確認範囲に含めない。
