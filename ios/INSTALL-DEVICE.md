# 実機インストール（iPhone(Kaito)）

Kikoeru と同じ手順。Team は `TPWX489GV4`（kitepon@gmail.com）。

Apple が Team を返さない間は、新しい Bundle ID（`dev.kitepon.yuihome`）のプロファイルが作れない。Xcode → Settings → Accounts でその Apple ID を入れ直し、Team が1件でも見えたら下を叩く。

```bash
cd /Users/kite/Developer/YuiHome/ios
xcodegen generate
xcodebuild -project Yui.xcodeproj -scheme Yui -configuration Debug \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=TPWX489GV4 CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY='Apple Development' build
APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/Yui-*/Build/Products/Debug-iphoneos/Yui.app | head -1)
xcrun devicectl device install app --device 5B552EC1-BD89-5E29-8FAF-3EAB4BC093CF "$APP"
```

初回は iPhone の「設定 → 一般 → VPNとデバイス管理」で開発元を信頼する。
