# StoreKitのローカル試験

出典: AppleのStoreKit DocumentationとApp Store Connect Help、結のXCTest実行結果。取得日: 2026年10月2日。確度: 公式仕様とiOS 27.0シミュレーターでの実測。Apple署名の本番サーバー検証と、プロセス強制終了からの復帰は今回の試験では未確認。

## 公式仕様

[StoreKitの試験環境の比較](https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox)では、Xcodeのローカル試験はシミュレーターと実機を使え、購入・復元・承認待ち・中断などを制御できる。Apple Accountやネットワーク接続を用意せず実行できる。一方、ローカル取引の署名はXcodeによるもので、Apple署名の取引検証とサーバー間通知にはSandboxまたはTestFlightを使う。

[TestFlightの購入試験](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/)はSandbox環境で動作する。専用Sandbox Apple Accountで条件を制御するには、端末の「メディアと購入」で通常のアカウントからサインアウトしたうえで、「デベロッパ」設定のSandbox Apple Accountへサインインする。開発署名アプリと同じアカウントがそのまま使われると想定しない。

原文の短い抜粋は[一次資料](ios-storekit/raw/apple-storekit-excerpts.md)に置く。

## 結の試験構成

`ios/YuiBilling.xctestplan`の`defaultOptions.storeKitConfigurationFilePath`で`YuiTests/Yui.storekit`を指定する。`SKTestSession`でローカル取引を作り、本体の`SessionStore`と`YuiClient`を呼ぶ。HTTPだけは`URLProtocol`で試験応答へ置き換える。本番の秘密情報を使わず、試験用の定数トークンだけを使う。

初回はテストプランへStoreKit設定を指定しておらず、実際のApple Account入力画面で停止した。テストプランへ設定を追加した後は、同じiOS 27.0シミュレーターで購入が完了した。この停止をAppleの既知不具合と断定しない。

## 実行結果

iPhone 17・iOS 27.0で次の7件が通過した。所属不一致を先に1件実行し、残る6件を実行した。復元試験だけは試験応答の不足で失敗し、`POST /api/apple/refresh`の応答を追加してその1件を再実行した。

|試験|確認したこと|
|---|---|
|所属不一致|専用コードによる拒否後、予約を解除し、2回目の購入も開始できる|
|購入成功|取引登録後、利用権が有効になる|
|キャンセル|StoreKitのキャンセルを模擬し、予約が解除される|
|承認待ち|予約を保持し、承認後の`Transaction.updates`で利用権が反映される|
|登録通信失敗|成功取引を登録できない場合、予約を保持する|
|復元|通信失敗後に`SessionStore`を作り直し、`AppStore.sync`と現在の利用権から復元できる|
|認証|Cookie保存済みでも、別のBearerトークンで別ユーザーを取得する|

最後の復元試験はオブジェクトの再作成であり、アプリのプロセス強制終了・再起動ではない。HTTPの応答を置き換えているため、本番APIの署名検証・永続化・通知はこの7件の合格からは判定しない。

ローカル結果bundleはXcodeBuildMCPの`workspaces/YuiHome-846d0b7b11b3/result-bundles/`配下に保存された。所属不一致は`test_sim_2026-10-01T22-48-46-002Z_pid88058_ac53b9b3.xcresult`、残る6件は`test_sim_2026-10-01T22-49-11-407Z_pid88058_f37da686.xcresult`、復元の再試験は`test_sim_2026-10-01T22-49-43-771Z_pid88058_3d5f73d4.xcresult`。
