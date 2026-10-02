# StoreKitのローカル試験

出典: AppleのStoreKit DocumentationとApp Store Connect Help、結のXCTest実行結果。取得日: 2026年10月2日。確度: 公式仕様とiOS 27.0シミュレーターでの実測。通常7件と、強制終了後に別プロセスで復帰する2ケースを確認した。Apple署名の本番サーバー検証はローカル試験の対象外。

## 公式仕様

[StoreKitの試験環境の比較](https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox)では、Xcodeのローカル試験はシミュレーターと実機を使え、購入・復元・承認待ち・中断などを制御できる。Apple Accountやネットワーク接続を用意せず実行できる。一方、ローカル取引の署名はXcodeによるもので、Apple署名の取引検証とサーバー間通知にはSandboxまたはTestFlightを使う。

[TestFlightの購入試験](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/)はSandbox環境で動作する。専用Sandbox Apple Accountで条件を制御するには、端末の「メディアと購入」で通常のアカウントからサインアウトしたうえで、「デベロッパ」設定のSandbox Apple Accountへサインインする。開発署名アプリと同じアカウントがそのまま使われると想定しない。

原文の短い抜粋は[一次資料](ios-storekit/raw/apple-storekit-excerpts.md)に置く。

[未完了の取引](https://developer.apple.com/documentation/storekit/transaction/unfinished)は未処理の購入を確認するために使う。[承認待ちの購入結果](https://developer.apple.com/documentation/storekit/product/purchaseresult/pending)が後から成功すると、`Transaction.updates`で取引が届く。承認待ちをキャンセル扱いにして予約を消さない。

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

## 強制終了からの復帰と修理

同じシミュレーターで前半のアプリをSIGKILLし、後半は別のXCTest実行・別のアプリプロセスで起動した。サーバーの永続予約を表すHTTP試験状態は端末の試験用ファイルから引き継ぐ。前半は意図したクラッシュとして失敗を返し、後半の合格と合わせて判定する。

|中断位置|実測|判定|
|---|---|---|
|購入成功後、登録通信失敗|PID 71446を終了。PID 71935が同じ取引ID 1を現在の利用権から復元し、予約を解消|通過|
|StoreKitの購入結果待ち、未承認|PID 80761を終了。PID 81428が保存した元の予約を再利用し、新規予約0件で購入完了|修理後に通過|

後半の結果bundleは順に`test_sim_2026-10-01T23-51-09-686Z_pid88058_95738463.xcresult`、`test_sim_2026-10-01T23-54-00-931Z_pid88058_85101baf.xcresult`。修理後の通常7件も`test_sim_2026-10-01T23-34-32-921Z_pid88058_6f99e5ec.xcresult`で全件通過した。

未承認の中断は、修理前に復元後も予約が残り、次の購入が409になる欠陥を再現した。予約IDがメモリにしかなく、終了後に同じ購入を再開する手がかりを失うのが原因だった。`ApplePurchaseRecovery`で予約ID・プラン・段階をアカウントごとに保存し、購入結果待ちで中断した場合だけ同じ予約で続ける。承認待ちは保持し、取引登録後やキャンセル後には保存記録を削除する。

保存記録のない旧版の予約は、この再開機能では回復できない。審査の既存予約は変更していない。今回の試験はStoreKitへ進んだ後の終了を対象とし、購入予約APIの応答を受ける前の終了は未確認。

「中断した購入を続ける」ボタンを画面から押す確認は、Device Hubへの接続タイムアウトと操作ツールの停止で完了しなかった。別プロセスからボタンが呼ぶ本体の購入処理を実行した結果は通過。ローカル取引の署名はXcodeによるため、Apple署名・本番通知の確認と混同しない。
