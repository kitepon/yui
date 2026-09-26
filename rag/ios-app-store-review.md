# iPhone版の審査準備で確認したApple仕様

出典: Apple Developer一次資料（下記）。取得日: 2026-09-26。確度: 公式文書の記述とApp Store Connectの画面で確認。

- [自動更新サブスクリプション](https://developer.apple.com/app-store/subscriptions/): 購入画面には契約名と期間、提供内容、更新時の総額を示す。無料体験を提示するなら期間と終了後の価格を明示する。復元導線、利用規約、プライバシーポリシーも必要。
- [初回オファーの設定](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions): App Store Connectで商品ごとに無料体験を設定する。結の月額・年額は同じグループに属し、双方に初回1か月無料を設定した。
- [アカウント削除](https://developer.apple.com/support/offering-account-deletion-in-your-app/): アカウントを作れるアプリはアプリ内に削除導線を設け、関連データを削除する。Appleの自動更新契約はアカウント削除だけでは解約されないため、管理画面を案内する。
- [Sign in with Appleのトークン解除](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple): Appleログインを使うアカウントを削除するときは、保存したrefresh token等を`/auth/revoke`に渡す。
- [App privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy): 収集するデータ種別、利用目的、個人との紐付け、追跡の有無を回答して公開する。結の申告は名前、メールアドレス、その他のユーザコンテンツ、ユーザID、デバイスID、購入履歴、製品の操作、その他のデータタイプの8種類。
- [暗号化の輸出申告](https://developer.apple.com/documentation/Security/complying-with-encryption-export-regulations): OS標準のHTTPS通信など、輸出申告書類が不要な暗号機能だけを使うアプリは`ITSAppUsesNonExemptEncryption`を`NO`にする。結のiPhone版は`URLSession`、Keychain、CryptoKitのSHA-256などApple標準の機能を使い、独自の暗号実装を含まない。
- [クラウド管理の配布証明書](https://developer.apple.com/help/account/certificates/cloud-managed-certificates): Xcode Organizerで配布すると、手元に配布証明書がない場合もAppleのクラウド管理証明書で署名できる。結のDeveloperチームには既存の`Distribution Managed`証明書がある。
