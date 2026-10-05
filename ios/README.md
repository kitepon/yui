# 結 Appleアプリ

SwiftUI製のiPhone・iPadアプリとMac Catalyst版。接続先は `https://yuihome.kitepon.dev`。
現在の実装範囲と残る確認は [`../docs/plan_iphone.md`](../docs/plan_iphone.md)。

```bash
cd ios
xcodegen generate
xcodebuild -project Yui.xcodeproj -scheme Yui -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO build
```

iPadはiPadシミュレーターをdestinationに指定する。Macは`platform=macOS,variant=Mac Catalyst`を指定する。プロジェクト設定の正本は`project.yml`で、生成した`Yui.xcodeproj`も同じコミットへ含める。

広い画面はサイドバー、狭い画面はタブで切り替える。Macのサイドバーは⌘1〜⌘4でも切り替えられる。機器一覧は画面幅に応じて列数が変わり、iPadは縦横の両方に対応する。

開発実行とApp Store配布には、それぞれ対応する署名プロファイルを使う。Macの権限はApp Sandbox、送信ネットワーク、Sign in with Apple。アプリとサブスクリプションの登録はiPhone・iPad・Macで共有する。

Debugだけの`-yui-test-login`は`YUI_TEST_EMAIL`と`YUI_TEST_PASSWORD`を起動環境から受け取る。認証、セッション取得、Keychain保存は通常の処理を使う。認証情報はargv、ログ、リポジトリへ渡さず、起動環境だけに置く。Releaseにはこの入口を含めない。

起動検証の環境と機器詳細の修理は[検証記録](../rag/mac-catalyst-launch-verification.md)、審査の結果は[配布記録](../docs/apple-platform-release.md)を参照する。

既存の結アカウントは Google ボタンからログインする。メールとパスワードを登録した
アカウントはその入力欄でも入れる。認証結果は iOS 標準の認証画面からアプリへ戻り、
一度だけ使えるコードをサーバーでセッションに引き換える。

## ログインボタンの素材

Appleは`ASAuthorizationAppleIDButton`の白い標準ボタンを使う。Googleは[Google Identityの公式ロゴ](https://developers.google.com/static/identity/images/g-logo.png)と[Google FontsのGoogle Sans](https://github.com/google/fonts/tree/main/ofl/googlesans)を使い、白い背景・指定色の文字と枠で表示する。ロゴの縦横比と色を保持し、両ボタンの幅と高さを揃える。[表示基準の確認](../rag/ios-app-store-review.md)。

GoogleのロゴはGoogleのブランド素材で、使用は[Googleの表示基準](https://developers.google.com/identity/branding-guidelines)に従う。Google Sansのライセンスは`Yui/Fonts/OFL.txt`に収める。

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

StoreKit設定はテストプランとテスト用bundleにだけ置く。通常の起動と配布アプリはApp Storeの商品を使う。HTTPは試験内で置き換えるため、本番の契約・予約・利用者情報は変更しない。Apple署名のサーバー検証と通知は、この試験の確認範囲に含めない。

### 強制終了と別プロセスでの復帰

`YuiRestart`は通常の7件から分けた専用プラン。次のコマンドの`試験名`を表の順に置き換え、同じシミュレーターで1件ずつ実行する。前半と後半の間にアプリのデータやStoreKit取引を消さない。

```bash
xcodebuild -project Yui.xcodeproj -scheme Yui -testPlan YuiRestart \
  -only-testing:YuiTests/YuiRestartTests/試験名 \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO test
```

|順序|試験名|期待結果|
|---|---|---|
|1|`test購入登録前に強制終了する`|未登録の成功取引と予約を確認し、SIGKILLで終了する|
|2|`test別プロセスで未完了取引を復元する`|同じ取引を復元し、利用権あり・予約なしになる|
|3|`test購入承認前に強制終了する`|StoreKitの結果待ち・取引0件を確認し、SIGKILLで終了する|
|4|`test承認前の中断から購入できる状態へ戻る`|元の予約を再利用して購入し、利用権あり・予約なしになる|

前半2件は意図的なプロセス終了のためXCTestが失敗を返す。ログの`YUI_RESTART_READY`または`YUI_RESTART_CONFIRMATION_READY`とSIGKILLを確認し、対応する後半が別PIDで通過したことを合格条件とする。結果は[検証記録](../rag/ios-storekit-local-testing.md)に記載した。

購入予約の再開記録はアカウントごとに端末へ保存する。保存記録のない旧版の予約は自動再開の対象外。承認待ちの購入は新しい購入へ進めず、承認後の取引更新を待つ。
