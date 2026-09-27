# iPhone版のApp Store提出

Web契約はStripe、iPhoneアプリ内の契約はAppleの自動更新サブスクリプションで扱う。サーバーは両方を同じ家の利用権として判定し、他方の契約中や購入手続き中には新しい購入を始めさせない。Apple取引は署名付きJWSを検証して結のアカウントに結び付ける。利用者はアプリから購入を復元し、契約状態を再取得できる。

## App Store Connectで保存済み

- アプリ「結 Yui」: Apple ID `6816410748`、Bundle ID `dev.kitepon.yuihome`。無料アプリ、日本だけで配信する設定。iPhone版1.0は提出準備中。
- サブスクリプショングループ「Yui Home」: `22415555`。
- 月額 `dev.kitepon.yuihome.subscription.monthly`: 日本で月100円。初回1か月無料。
- 年額 `dev.kitepon.yuihome.subscription.annual`: 日本で年1,000円。初回1か月無料。
- プライバシーポリシーURL: `https://yuihome.kitepon.dev/privacy`。
- Sign in with Apple と In-App Purchase のApp ID能力は有効。
- iPhone配布ビルドの`ITSAppUsesNonExemptEncryption`は`NO`。OS標準の暗号機能だけを使用するため、署名前のアーカイブ内でも値を確認した。
- iPhone版1.0のビルド2はアーカイブ、署名、アップロードを通過し、TestFlightで「提出準備完了」と表示された。App Store版1.0の審査対象にビルド2を紐付けて保存した。ビルドのBundle IDは`dev.kitepon.yuihome`、暗号化の申告値は「いいえ」。ビルド1は審査対象から外した。
- 本番サーバーのApple課金対応コードは公開済み。`/support`と`/privacy`を公開URLで確認済み。
- Sign in with Apple と In-App Purchase の鍵を作成し、秘密鍵をリポジトリ外に保管した。本番サーバーの設定とアプリの再起動が完了し、Apple課金の設定済み状態と通知APIの受信を確認した。
- App Store Server Notifications V2 の本番・Sandbox送信先を登録した。
- Apple公式の[通知テストAPI](https://developer.apple.com/documentation/appstoreserverapi/request-a-test-notification)でSandboxへの送信を要求し、Appleの送信結果`SUCCESS`と本番サーバーの通知履歴への保存を確認した。`TEST`通知の受信・署名検証・永続化は通過。本番通知テストAPIはHTTP 401を返したため、公開後に再確認する。公開前アプリで同じ挙動になり、公開後に解消した報告が[Apple Developer Forums](https://developer.apple.com/forums/thread/711801)にあるが、結での原因は未確定。
- App Store ConnectにSandboxテスターを登録し、再読み込み後の一覧表示で確認した。iPhone 17 Pro Maxシミュレーターでは未契約の結アカウントでログインでき、購入ボタンからApple Accountサインイン画面へ到達した。Sandboxテスターの端末サインインはオーナーの入力待ち。
- iPhone 6.9インチ用の画面写真3枚を、家・場面・分析の順で登録した。
- 月額と年額の両サブスクリプションに、未契約時の購入画面の審査用画像を登録した。サブスクリプショングループ、月額、年額の3項目を同じApp Review提出下書きに追加した。アプリ本体を追加する段階では、連絡先情報と公開済みプライバシー回答が必要と表示された。
- 審査専用アカウントを作り、課金免除でデモ機器8台と場面4件を用意した。デモ照明の操作を確認した。未契約の購入試験用アカウントも別に用意した。認証情報はリポジトリ外に保管する。
- iPhone 17 Pro Maxシミュレーターで未契約アカウントの購入画面を表示し、月額・年額の購入ボタンと復元導線を確認した。月額ボタンからStoreKitのApple Accountサインイン画面まで進んだ。Sandbox Apple Account未登録のため、購入確定と初回無料体験の表示は未検証。日本の価格設定は保存済みだが、未ログインのシミュレーターは米ドル表示だった。
- シミュレーターでAppleログイン失敗時に英語の内部エラーが露出したため、日本語の操作案内へ修正して再現確認した。修正版はビルド2として提出する。

Sandbox Apple AccountはApp Store Connectの「ユーザとアクセス > Sandbox」で作成する。開発署名アプリで最初の購入を試みると、テスト端末の「設定 > デベロッパ > Sandbox Apple Account」にサインイン欄が現れる。通常の端末用Apple Accountからサインアウトする必要はない。作成時のメールアドレスは既存のApple Accountに未使用のものを使う。出典: [AppleのSandboxアカウント作成手順](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/create-a-sandbox-apple-account)、[StoreKitのSandbox試験手順](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)。

## 提出までの残作業

1. アプリのプライバシー回答を公開する。Appleの最終確認画面に正確性・規約遵守・更新義務への同意が表示されたため、オーナーの回答待ち。
2. App Reviewの連絡先電話番号と審査用アカウントのパスワードを登録する。Appleへのパスワード送信確認と電話番号の回答待ち。氏名・メール・審査説明は入力したが、必須欄が空で保存できていない。
3. Sandboxテスターで端末へサインインし、購入・復元・更新・解約・返金、WebとiPhoneの利用権、Stripe契約中の二重購入防止、Appleログイン・アカウント削除を実機で確認する。Sandboxの`TEST`通知だけでは実購入の通知や利用権更新は検証できない。
4. iPhone版1.0を既存の提出下書きに追加し、グループ・月額・年額とともに審査へ提出する。

ビルド成功や商品登録だけでは、購入と通知の動作は確認できない。審査承認後は手動でリリースする設定にしている。
