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

実機へのビルドと導入は [INSTALL-DEVICE.md](INSTALL-DEVICE.md)。App Store への提出は未実施。
