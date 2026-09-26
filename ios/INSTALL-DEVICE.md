# 実機インストール（iPhone(Kaito)）

開発用 Team は `TPWX489GV4`。端末と Mac を接続して実行する。

```bash
cd /Users/kite/Developer/YuiHome/ios
xcodegen generate
xcodebuild -project Yui.xcodeproj -scheme Yui -configuration Debug \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/yui-device-build \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=TPWX489GV4 CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY='Apple Development' build
xcrun devicectl device install app --device 00008140-000019223A40801C \
  /tmp/yui-device-build/Build/Products/Debug-iphoneos/Yui.app
xcrun devicectl device process launch --device 00008140-000019223A40801C dev.kitepon.yuihome
```

端末を替えたら `xcrun devicectl list devices` で UDID を読み替える。
