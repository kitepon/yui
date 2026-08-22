# 結 iOS

SwiftUI。サーバーは `https://yuihome.kitepon.dev`。計画は [`../docs/plan_iphone.md`](../docs/plan_iphone.md)。

```bash
cd ios
xcodegen generate
xcodebuild -scheme Yui -destination 'platform=iOS Simulator,name=iPhone 16' build
```

実機は Xcode で Team を入れて Run。App Store 提出はこの工程の外。
