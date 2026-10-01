# iOSの配布署名とTestFlightの内部テスト

出典: AppleのXcode HelpとApp Store Connect Help。取得日: 2026年10月2日。確度: 公式仕様を確認し、結のビルド4で書き出し・検証・アップロード・内部配布を実測。所有者から実機での導入と試験用アカウントへのログインを確認した。

## 公式仕様

- [Download manual provisioning profiles](https://help.apple.com/xcode/mac/current/en.lproj/deva899b4fe5.html): 開発者アカウントで手動作成したプロファイルは、Xcodeのアカウント設定でチームを選び「Download Manual Profiles」を実行すると取得・インストールされる。
- [Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers): 内部テストは既存のApp Store Connectユーザーをグループへ追加し、ビルドを割り当てる。利用可能なビルドがあると招待メールが送られ、端末のTestFlightで受け取る。
- [Create a beta group](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betagroups): 公式APIでアプリに関連付けたグループを作成できる。作成要求の属性には`isInternalGroup`がある。

短い原文抜粋は[一次資料](ios-testflight/raw/apple-distribution-excerpts.md)へ保存した。

## 結での実測

配布証明書とプロファイルに含まれる証明書が一致しない書き出しは失敗した。既存の有効な配布証明書を指定してプロファイルを作成し、Xcodeから取得した後の手動署名による書き出しは成功した。新しい秘密鍵の発行は不要だった。

AppleのIPA検証とaltoolのアップロードは成功した。接続ツールのREST送信は`bundleVersion`という未知の属性を送り、`cfBundleShortVersionString`、`cfBundleVersion`、`app`関係を欠いた要求として拒否された。このエラーを記録・報告して、同じツールが公開するaltool方式を使用した。

処理完了後に内部グループへビルドを割り当て、公式APIで`IN_BETA_TESTING`とテスターの`INVITED`を確認した。これらは配布が可能な状態の確認であり、端末での導入や購入処理の確認には含めない。

後続の実機写真では試験用の結アカウントへのログインと購入確認画面を確認した。購入画面のApple Accountは開発署名版の試験に使ったSandbox Apple Accountと異なった。所属不一致を再現するには購入するApple Accountと既存取引の所有者も一致させる必要がある。アプリの結アカウント表示だけでは試験条件を満たさない。
