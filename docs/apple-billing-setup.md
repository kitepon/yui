# iPhone版のApp Store提出

Web契約はStripe、iPhoneアプリ内の契約はAppleの自動更新サブスクリプションで扱う。サーバーは両方を同じ家の利用権として判定し、他方の契約中や購入手続き中には新しい購入を始めさせない。Apple取引は署名付きJWSを検証して結のアカウントに結び付ける。利用者はアプリから購入を復元し、契約状態を再取得できる。

## App Store Connectで保存済み

- アプリ「結 Yui」: Apple ID `6816410748`、Bundle ID `dev.kitepon.yuihome`。無料アプリ、日本だけで配信する設定。
- サブスクリプショングループ「Yui Home」: `22415555`。
- 月額 `dev.kitepon.yuihome.subscription.monthly`: 日本で月100円。初回1か月無料。
- 年額 `dev.kitepon.yuihome.subscription.annual`: 日本で年1,000円。初回1か月無料。
- プライバシーポリシーURL: `https://yuihome.kitepon.dev/privacy`。
- Sign in with Apple と In-App Purchase のApp ID能力は有効。
- iPhone配布ビルドの`ITSAppUsesNonExemptEncryption`は`NO`。OS標準の暗号機能だけを使用するため、署名前のアーカイブ内でも値を確認した。
- iPhone版1.0のビルド3はアーカイブ、署名、アップロード、Apple側の処理を通過し、App Store版1.0の審査対象に紐付けた。ビルドのBundle IDは`dev.kitepon.yuihome`、暗号化の申告値は「いいえ」。ビルド1と2は審査対象から外した。
- 本番サーバーのApple課金対応コードは公開済み。`/support`と`/privacy`を公開URLで確認済み。
- Sign in with Apple と In-App Purchase の鍵を作成し、秘密鍵をリポジトリ外に保管した。本番サーバーの設定とアプリの再起動が完了し、Apple課金の設定済み状態と通知APIの受信を確認した。
- App Store Server Notifications V2 の本番・Sandbox送信先を登録した。
- Apple公式の[通知テストAPI](https://developer.apple.com/documentation/appstoreserverapi/request-a-test-notification)でSandboxへの送信を要求し、Appleの送信結果`SUCCESS`と本番サーバーの通知履歴への保存を確認した。`TEST`通知の受信・署名検証・永続化は通過。本番通知テストAPIはHTTP 401を返したため、公開後に再確認する。公開前アプリで同じ挙動になり、公開後に解消した報告が[Apple Developer Forums](https://developer.apple.com/forums/thread/711801)にあるが、結での原因は未確定。
- App Store ConnectにSandboxテスターを登録し、再読み込み後の一覧表示で確認した。iPhone 17 Pro Maxシミュレーターでは未契約の結アカウントでログインでき、購入ボタンからApple Accountサインイン画面へ到達した。Sandboxテスターは2ファクタ認証の設定まで完了したが、iOS 26.5シミュレーターのApple Media Servicesが資格情報の検証で`Authentication Failed Encountered an unrecognized authentication failure`を返し、Sandbox Apple Accountとして保存されなかった。結の通信とSandboxテスターのパスワード認証は通過しており、購入確定は実機で確認する。
- iPhone 6.9インチ用の画面写真3枚を、家・場面・分析の順で登録した。
- 月額と年額の両サブスクリプションに、未契約時の購入画面の審査用画像を登録した。
- 審査専用アカウントを作り、課金免除でデモ機器8台と場面4件を用意した。デモ照明の操作を確認した。未契約の購入試験用アカウントも別に用意した。認証情報はリポジトリ外に保管する。
- iPhone 17 Pro Maxシミュレーターで未契約アカウントの購入画面を表示し、月額・年額の購入ボタンと復元導線を確認した。月額ボタンからStoreKitのApple Accountサインイン画面まで進んだ。Sandbox Apple Accountをシミュレーターへ保存できないため、購入確定と初回無料体験の表示は未検証。日本の価格設定は保存済みだが、未ログインのシミュレーターは米ドル表示だった。
- シミュレーターでAppleログイン失敗時に英語の内部エラーが露出したため、日本語の操作案内へ修正して再現確認した。修正版はビルド2以降へ反映した。
- StoreKitが購入結果を返す前に例外終了すると、サーバーのApple購入予約が残り続ける欠陥を修正した。StoreKitサービスを停止して例外経路を再現し、修正版では直後に新しい購入予約を作成できることを本番APIで確認した。試験用予約と一時テストアカウントは確認後に削除した。この修正版をビルド3として提出した。
- Appのプライバシー回答を公開した。購入履歴、メールアドレス、その他のユーザコンテンツ、ユーザID、その他のデータ、製品の操作、デバイスID、氏名の8種類を、利用者に関連付ける「アプリの機能」用途として申告した。
- App Reviewの連絡先、審査専用アカウント、審査説明を保存した。審査説明には、課金免除のデモアカウント、未契約アカウントでの商品確認手順、両プランの初回1か月無料、二重契約防止、サーバー検証とWeb・iPhone間の契約同期を記載した。
- iOSアプリ1.0（ビルド3）、サブスクリプショングループ、月額、年額の4項目を2026年9月27日12:02に審査へ提出した。提出IDは`6d7386aa-19cb-498c-b794-c483e6cef7cd`。提出直後は4項目とも「審査待ち」だった。承認後は手動でリリースする。

Sandbox Apple AccountはApp Store Connectの「ユーザとアクセス > Sandbox」で作成する。開発署名アプリで最初の購入を試みると、テスト端末の「設定 > デベロッパ > Sandbox Apple Account」にサインイン欄が現れる。通常の端末用Apple Accountからサインアウトする必要はない。作成時のメールアドレスは既存のApple Accountに未使用のものを使う。出典: [AppleのSandboxアカウント作成手順](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/create-a-sandbox-apple-account)、[StoreKitのSandbox試験手順](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)。

## 再拒絶と購入の再現調査

- 2026年9月30日、最初の拒絶で指摘された利用規約のリンクを日本語のアプリ説明に追加した。Apple標準利用規約を使い、App Store Connect APIから同じビルド3を再提出した。
- 10月1日の再拒絶はGuideline 2.1(b)。AppleはiPad Air 11インチ（M3）、iPadOS 27.0でアプリ内購入を完了できなかったと報告した。添付画面は「App Storeの購入手続き中」で、次の購入ボタンが表示されていなかった。
- 添付画面のアカウントと一致する本番データに、10月1日21:35:42のApple購入予約が残っていた。予約の期限はなく、購入完了した取引の保存は0件だった。予約が次の購入を止めていることは確認済みだが、StoreKitの承認待ち、アプリの中断、取引登録の失敗のどれで残ったかは未確定。本番データの解除や課金処理の変更は行っていない。
- iOS 27.0シミュレーターでは、MCPが入力成功を返しても画面に文字が入らず、購入の再現に進めなかった。Xcode 27の操作画面は[Device Hub](https://developer.apple.com/documentation/xcode/device-hub)へ移っている。実機の初回デバッグも、OSの共有キャッシュがMacにないためシステム情報の取得に時間がかかり、購入操作に到達しなかった。
- iPhone 16 Pro Max（iOS 26.6.2）で、ビルド3の課金処理に診断ログを付けた一時コピーを起動した。未契約・購入予約なしの試験用アカウントを実行中だけ使い、家の表示とログ取得を確認した。リポジトリのアプリ本体は変更していない。
- 実機で月額購入の確認画面と初回1か月無料の表示を確認した。最初の操作はStoreKitから`userCancelled`が返り、購入予約の解除を確認した。続く承認操作では、Appleが通常のApple AccountにSandbox購入権限がないと表示し、アプリへ`Unable to Complete Request`を返した。この例外でも購入予約は解除され、利用権は未契約のままだった。App Store Connect APIで日本向けのYui用Sandboxテスターが登録済みであることを確認した。Sandbox専用アカウントへの実機サインインを待っている。この権限エラーだけでは審査時に購入予約が残った原因を説明できない。
- 10月2日、パスワードを確認できなかった既存テスターに代えて、日本向けの新しいYui用Sandboxテスターを作成した。JevはApp Store Connectの読み込み中に操作要素を取得できず停止したため、その停止を報告してCodexのブラウザ操作へ切り替えた。登録後は公式APIでテスター1件、日本、購入中断設定なしを確認した。新しいログイン情報はリポジトリ外へ保存し、実機でSandbox Apple Accountへのサインインが完了した。
- 10月2日1:30ごろ、同じ実機で月額購入が完了した。Appleの「購入手続きが完了しました」画面とSandbox環境の表示を確認した。本番APIはApple月額の無料体験中・利用権あり・購入予約なしを返し、読み取り専用のDB照合でもSandboxの月額取引1件、購入予約0件を確認した。実機のコンソール接続は購入前に切れており、アプリからの取引登録とApple通知のどちらで保存されたかはログで判別できない。通常の購入は成功したが、審査時に予約が残った経路は未確定。アプリ内の反映と「購入を復元・契約状態を更新」の実機操作を確認中。
- 同じ実機の「購入を復元・契約状態を更新」で、月額プランが表示され、エラーが出ないことを確認した。後続の本番API照合では、Sandboxの更新期間が終了し、未契約・購入予約なしになっていた。
- 別の結の試験用アカウントへ切り替えて月額購入を試したところ、StoreKitは以前のアカウントに紐づく取引を成功結果として返した。サーバーは所属の不一致を理由に登録を拒否したが、アプリは成功結果を受けた時点で予約解除の対象から外しており、予約が残った。もう一度購入を押すと、審査添付と同じ「App Storeの購入手続き中」が表示された。この経路は実機ログ・画面・本番APIで再現済み。審査時にもこの経路を通ったかは未確定。
- 試験用アカウントへの切り替えが反映されなかった原因も確認した。iPhoneの通信はBearerトークンと保存Cookieを同時に送り、サーバーのCookieキャッシュが以前のアカウントを返した。Cookieを保持するHTTPクライアントでも、別アカウントのBearerトークンを送った後に以前のアカウントが返ることを再現した。iPhoneの通信はKeychainのBearerトークンだけで認証するよう修正した。
- 取引登録APIが所属不一致を専用のエラーコードで返し、iPhoneはこの確定した拒否だけを購入予約の解除対象へ戻すよう修正した。StoreKitの承認待ちと、成功取引の登録時に起きた通信失敗はこの解除に含めない。修正版はビルド4として検証中。
- 修正に直結するテスト5件、lint、typecheck、全テスト278件、開発用ビルド、iOSビルドが通過した。修正コミットをmainへpushし、そのコミットを本番サーバーへ配備した。公開URLはHTTP 200を返した。所属不一致の応答コードと予約解除の実機確認はまだ完了していない。
- 実機が外出中のため、配布と後続の確認はTestFlightで行う。正規ソースからビルド4を作成し、AppleのIPA検証とaltoolでのアップロードが成功した。App Store Connectの処理は`VALID`、内部配布は`IN_BETA_TESTING`になり、所有者のテスターは`INVITED`になった。診断用の実行環境や一時ログはこのビルドに含めていない。
- 配布時に、このMacの配布証明書を含まない古いプロファイルで書き出しが失敗した。既存の有効な証明書を含むプロファイルを公式APIで作成し、Xcodeの「Download Manual Profiles」で取得して書き出した。JevはXcodeの取り込み操作と設定画面で停止したため、停止を報告してCodexの画面操作で取得した。接続ツールのRESTアップロードは要求属性の仕様不一致で拒否され、そのエラーを報告して同じツールのaltool方式を使った。

次は所有者がTestFlightの1.0（4）をインストールし、「接続」のアカウント表示を確認する。続いて所属不一致後の購入予約解除とアカウント切り替えを確認し、購入途中の終了・再起動、購入・復元を確認した版を再提出する。再提出はまだ行っていない。インストール確認のApproval Box申請は`CODEX_STEER_RESTART_REQUIRED`で作成されなかったため、そのエラーを報告し、この会話で操作を案内する。

## 審査中と公開後の作業

1. Appleの審査結果と問い合わせを確認する。審査中の4項目は同じ提出で管理する。
2. Sandboxテスターを使い、購入・復元・更新・解約・返金、WebとiPhoneの利用権、Stripe契約中の二重購入防止、Appleログイン・アカウント削除を実機で確認する。iOS 26.5シミュレーターではApple Media Servicesの認証に失敗するため、Sandboxの`TEST`通知だけでは確認できない実購入の通知や利用権更新はTestFlightを導入した実機で確認する。
3. 承認後に手動でリリースし、App Storeから導入した版でログイン、家の表示、機器操作、購入・復元を確認する。

ビルド成功や商品登録だけでは、購入と通知の動作は確認できない。Sandboxの月額購入、サーバーへの利用権反映、復元は実機で確認した。所属不一致後に購入予約が残る欠陥は再現できたが、審査時の失敗が同じ経路だったかは未確定。

## App Store Connectの自動化

Apple公式の[App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)は、ビルド、App Storeバージョン、サブスクリプション、[審査提出](https://developer.apple.com/documentation/appstoreconnectapi/review-submissions)を扱える。次回から対応する登録・更新・状態確認は、リポジトリ外で保管する個人APIキーによるJWT認証を正規経路にする。APIで扱えない申告項目だけApp Store Connectの画面で操作する。
