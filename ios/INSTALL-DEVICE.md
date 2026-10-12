# 実機インストール（iPhone）

開発用 Team は `TPWX489GV4`。端末と Mac を接続して実行する。

```bash
cd /Users/kite/Developer/YuiHome/ios
xcodegen generate
xcodebuild -project Yui.xcodeproj -scheme Yui -configuration Debug \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/yui-device-build \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=TPWX489GV4 CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY='Apple Development' build
xcrun devicectl device install app --device 00000000-0000000000000000 \
  /tmp/yui-device-build/Build/Products/Debug-iphoneos/Yui.app
xcrun devicectl device process launch --device 00000000-0000000000000000 dev.kitepon.yuihome
```

`--device` の `00000000-0000000000000000` は見本。`xcrun devicectl list devices` で実機の UDID を読んで置き換える。
