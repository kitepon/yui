# iPhone版のApp Store提出

Web契約はStripe、iPhoneアプリ内の契約はAppleの自動更新サブスクリプションで扱う。サーバーは両方を同じ家の利用権として判定し、他方の契約中や購入手続き中には新しい購入を始めさせない。Apple取引は署名付きJWSを検証して結のアカウントに結び付ける。利用者はアプリから購入を復元し、契約状態を再取得できる。

## App Store Connectで保存済み

- アプリ「結 Yui」: Apple ID `6816410748`、Bundle ID `dev.kitepon.yuihome`。無料アプリ、日本だけで配信する設定。iPhone版1.0は提出準備中。
- サブスクリプショングループ「Yui Home」: `22415555`。
- 月額 `dev.kitepon.yuihome.subscription.monthly`: 日本で月100円。初回1か月無料。
- 年額 `dev.kitepon.yuihome.subscription.annual`: 日本で年1,000円。初回1か月無料。
- プライバシーポリシーURL: `https://yuihome.kitepon.dev/privacy`。
- Sign in with Apple と In-App Purchase のApp ID能力は有効。

## 提出までの残作業

1. Apple DeveloperでSign in with Appleの鍵、App Store ConnectでIn-App Purchase鍵を作る。`.p8`の内容をリポジトリやDocker imageへ入れない。
2. 本番サーバーの`deploy/.env`に次を設定する。

   | 用途 | 変数 |
   | --- | --- |
   | Appleログインの認可コード交換・削除時のトークン解除 | `APPLE_SIGNIN_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY_BASE64` |
   | Apple取引の検証と契約状態照会 | `APPLE_APP_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY_BASE64` |

   `*_PRIVATE_KEY_BASE64`にはダウンロードした`.p8`全体をbase64化した値を設定する。`APPLE_APP_ID`は`6816410748`。鍵は再ダウンロードできないため、アクセスを限定して保管する。
3. サーバーを更新し、App Store Server Notifications V2の本番・Sandbox送信先を`https://yuihome.kitepon.dev/api/apple/notifications`に設定する。
4. 審査用の機器データを持つ専用アカウント、iPhoneの画面写真、サブスクリプション審査用の画面写真、審査担当者への説明を用意する。
5. 署名付きiOSビルドをApp Store Connectへアップロードする。Sandboxで購入・復元・更新・解約・返金、WebとiPhoneの利用権、Stripe契約中の二重購入防止、Appleログイン・アカウント削除を実機で確認する。
6. iPhone版1.0と両サブスクリプションを審査へ提出する。

本番にApple課金設定がなければ、iPhoneアプリは「App Storeでの購入は準備中です」と表示する。ビルド成功や商品登録だけでは、購入と通知の動作は確認できない。
