# 結 Appleアプリ

SwiftUI製のiPhone・iPadアプリとMac Catalyst版。接続先は `https://yuihome.kitepon.dev`。
一般向けのiPhone・iPad版は[日本のApp Store](https://apps.apple.com/jp/app/id6816410748)から導入する。Mac版も同じアプリ登録で公開した。ストアへの反映と実機確認の状況は[iPhone・iPad版](../docs/apple-platform-release.md#iphoneipad版の一般公開)と[Mac版](../docs/apple-platform-release.md#mac版の一般公開)の配布記録を参照する。
現在の実装範囲と残る確認は [`../docs/plan_iphone.md`](../docs/plan_iphone.md)。

センサー条件の戻り幅と分析の打ち切り記録への対応、検証結果、サーバー配備後に配布する順序は[対応記録](../docs/native-automation-conditions.md)を参照する。

```bash
cd ios
xcodegen generate
xcodebuild -project Yui.xcodeproj -scheme Yui -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO build
```

iPadはiPadシミュレーターをdestinationに指定する。Macは`platform=macOS,variant=Mac Catalyst`を指定する。プロジェクト設定の正本は`project.yml`で、生成した`Yui.xcodeproj`も同じコミットへ含める。

広い画面はサイドバー、狭い画面はタブで切り替える。Macのサイドバーは⌘1〜⌘4でも切り替えられる。機器一覧は画面幅に応じて列数が変わり、iPadは縦横の両方に対応する。

開発実行とApp Store配布には、それぞれ対応する署名プロファイルを使う。Macの権限はApp Sandbox、送信ネットワーク、Sign in with Apple。アプリとサブスクリプションの登録はiPhone・iPad・Macで共有する。

起動検証の環境と機器詳細の修理は[検証記録](../rag/mac-catalyst-launch-verification.md)、審査の結果は[配布記録](../docs/apple-platform-release.md)を参照する。

## ログインと端末

ログインは共通ライブラリ login-billing（SwiftPM、タグ v0.28.0 を固定）の Sign in with Apple だけで行う。端末の鍵は Keychain（この端末のみ）に置き、家への呼び出しはすべて `Login-Billing-Key` の署名つきで送る。サーバーはメールもトークンも持たない。

- 初めての端末は「ここから始める」、すでに結を使っている人は別の端末の QR を読んで参加する。iPad と Mac も自分で始められる。Mac は QR を出す側だけで、読み取りと追加は iPhone・iPad で行う。
- 以前の結のアカウントは、始めた直後の画面で Apple・Google・メールのどれかで確かめて引き継ぐ（Google は yui-hosted の iOS クライアントでこの画面だけに使う）。
- 契約は端末の StoreKit で読み、終わりの日を `/api/home/paid-until` へ送る（起動時、前面に戻った時、購入・復元後）。サーバーは Apple も Google も呼ばない。
- 構造とデータの流れの正本は [`docs/apple-function-dataflow.md`](docs/apple-function-dataflow.md)、契約は [`../docs/hosted-login-billing-contract.md`](../docs/hosted-login-billing-contract.md)。

## ログインボタンの素材

Appleは`ASAuthorizationAppleIDButton`の白い標準ボタンを使う。[表示基準の確認](../rag/ios-app-store-review.md)。

実機へのビルドと導入は [INSTALL-DEVICE.md](INSTALL-DEVICE.md)。App Store提出とTestFlight配布の現在地は [課金設定と審査記録](../docs/apple-billing-setup.md) を参照する。

## 購入処理の自動試験

`YuiBilling`テストプランは、StoreKitのローカル商品と試験用HTTP応答を使い、`SessionStore`と`YuiClient`をシミュレーター上で実行する。Apple Accountの入力や実機の操作は要らない。

```bash
cd ios
xcodegen generate
xcodebuild -project Yui.xcodeproj -scheme Yui -testPlan YuiBilling \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO test
```

確認するのは、購入後に契約の終わりを送ること、記録せずに終了しても次の起動で送ること、キャンセルと承認待ちで何も送らないこと、契約が無い端末は日付を送らないこと、削除・引き継ぎ・リンクコード・書き出しの応答の扱い。購入を伴う4件はStoreKitの購入画面を出すため、ウィンドウのあるSimulatorが無い環境ではスキップする（理由つき）。

StoreKit設定はテストプランとテスト用bundleにだけ置く。HTTPは試験内で置き換えるため、本番の利用者情報は変更しない。端末の鍵と署名つき呼び出しの通し確認は、検証用サーバーに対するシミュレーター実行で行う。
