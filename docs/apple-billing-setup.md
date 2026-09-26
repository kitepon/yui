# iPhone課金の設定と現在地

WebはStripe、iPhoneアプリはAppleの自動更新サブスクリプションを使う。サーバーは双方を家の利用権へ統合する。Apple取引はStoreKitの署名付きJWSをAppleのルート証明書で検証し、購入時の`appAccountToken`で結のユーザーへ結びつける。通知は`/api/apple/notifications`で受け、利用者の「購入を復元・契約状態を更新」はStoreKitの同期とApp Store Server APIの状態取得を行う。

## App Store Connectで必要な設定

1. App Store ConnectのWeb画面でBundle ID `dev.kitepon.yuihome`の新規アプリを作り、数値のApple IDを控える。Apple公式APIは新規アプリレコードを作成できない。
2. 同じサブスクリプショングループに月額`dev.kitepon.yuihome.subscription.monthly`と年額`dev.kitepon.yuihome.subscription.annual`を作る。日本の価格はWeb契約の月100円／年1,000円に合わせられるか価格表で確認する。Webの30日試用に対し、Appleの無料体験は「1か月」が設定候補なので、条件をオーナーと確定してから設定する。
3. App Store Server APIのIn-App Purchase鍵（`.p8`）、Key ID、Issuer IDを用意する。鍵の中身をリポジトリやimageに入れない。
4. App Store Server Notifications V2の本番・Sandbox送信先を`https://yuihome.kitepon.dev/api/apple/notifications`に設定する。
5. 本番サーバーの環境変数に`APPLE_APP_ID`（数値）、`APPLE_IAP_KEY_ID`、`APPLE_IAP_ISSUER_ID`、`APPLE_IAP_PRIVATE_KEY_BASE64`（`.p8`全体をbase64化）を設定し、通常の本番更新手順で再起動する。
6. Sandbox購入、更新、解約、返金、復元を実機で確認する。`/api/stripe/status`の`entitlement.provider`が`apple`となり、WebとiPhone双方から家を操作できることを確認する。Stripe契約者のWeb経路も確認する。

本番環境に上記のApple設定が無ければ、iPhoneアプリは「App Storeでの購入は準備中です」と表示する。コードのビルド成功は、App Store Connectの商品・鍵・通知設定や実課金試験の成功を意味しない。

## 現在地

- Apple DeveloperにBundle ID `dev.kitepon.yuihome`を登録済み。In-App Purchase能力が有効なことをAPIで確認済み。
- App Store Connectのアプリレコードは未作成。AppleのAPIでは作れないため、Web画面での新規登録をオーナーへ依頼中。
- サーバー`59ee1d6`を本番へ配備し、iPhone(Kaito)へ同版の開発用ビルドを導入・起動済み。Appleの課金設定は本番にまだ無く、購入・復元の実取引は未検証。
