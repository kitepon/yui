# iPhone版の審査準備で確認したApple仕様

出典: Apple Developer一次資料（下記）。取得日: 2026-09-26。確度: 公式文書の記述とApp Store Connectの画面で確認。

- [自動更新サブスクリプション](https://developer.apple.com/app-store/subscriptions/): 購入画面には契約名と期間、提供内容、更新時の総額を示す。無料体験を提示するなら期間と終了後の価格を明示する。復元導線、利用規約、プライバシーポリシーも必要。
- [初回オファーの設定](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions): App Store Connectで商品ごとに無料体験を設定する。結の月額・年額は同じグループに属し、双方に初回1か月無料を設定した。
- [アカウント削除](https://developer.apple.com/support/offering-account-deletion-in-your-app/): アカウントを作れるアプリはアプリ内に削除導線を設け、関連データを削除する。Appleの自動更新契約はアカウント削除だけでは解約されないため、管理画面を案内する。
- [Sign in with Appleのトークン解除](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple): Appleログインを使うアカウントを削除するときは、保存したrefresh token等を`/auth/revoke`に渡す。
- [App privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy): 収集するデータ種別、利用目的、個人との紐付け、追跡の有無を回答して公開する。結の申告は名前、メールアドレス、その他のユーザコンテンツ、ユーザID、デバイスID、購入履歴、製品の操作、その他のデータタイプの8種類。
- [暗号化の輸出申告](https://developer.apple.com/documentation/Security/complying-with-encryption-export-regulations): OS標準のHTTPS通信など、輸出申告書類が不要な暗号機能だけを使うアプリは`ITSAppUsesNonExemptEncryption`を`NO`にする。結のiPhone版は`URLSession`、Keychain、CryptoKitのSHA-256などApple標準の機能を使い、独自の暗号実装を含まない。
- [クラウド管理の配布証明書](https://developer.apple.com/help/account/certificates/cloud-managed-certificates): Xcode Organizerで配布すると、手元に配布証明書がない場合もAppleのクラウド管理証明書で署名できる。結のDeveloperチームには既存の`Distribution Managed`証明書がある。

## 再提出APIの確認

2026年10月2日、Apple公式の[審査項目の更新属性](https://developer.apple.com/documentation/appstoreconnectapi/reviewsubmissionitemupdaterequest/data-data.dictionary/attributes-data.dictionary)に`resolved`、[提出の更新属性](https://developer.apple.com/documentation/appstoreconnectapi/reviewsubmissionupdaterequest/data-data.dictionary/attributes-data.dictionary)に`submitted`があることを確認した。再拒絶を解決した同じ提出では、修正版のビルドと審査説明を保存してから、拒絶項目を解決済みにし、提出を再送する。App Store版、サブスクリプショングループ、月額・年額の4項目を同じ提出で保つ。

Markdown版には属性一覧が省略されていたため、同じApple文書の`tutorials/data/documentation/appstoreconnectapi/`配下のJSONで属性名とboolean型を確認した。審査用パスワードを含む説明は公式APIにだけ送り、リポジトリやコマンドの出力へ記録しない。

## ログインボタンの表示基準

出典: [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)、[Appleの公式ボタン](https://developer.apple.com/documentation/authenticationservices/asauthorizationappleidbutton)、[Google Identity](https://developers.google.com/identity/branding-guidelines)。取得日: 2026-10-06。確度: 公式仕様。短い原文は[抜粋](ios-storekit/raw/sign-in-branding-excerpts.md)へ保存した。

- Appleのボタンは他のログインボタンより小さくせず、スクロールせず見える位置に置く。黒いスタイルは明るい背景、白いスタイルは暗い背景で使う。
- 独自のAppleボタンも許されるが、公式のロゴ素材・色・表示名と文字／高さの比率を守る。システムフォントでは文字サイズがボタン高さの約43%。公式部品ではこの描画をOSへ任せられる。
- Googleのボタンには公式の多色Gを使う。自作・単色・古いGで代用しない。白い背景の指定色は文字`#1F1F1F`、枠`#747775`、指定フォントはGoogle Sans Medium。拡大時もロゴの縦横比を保持する。
- 結の旧Appleボタンは暗い背景に黒を置き、高さ57ptに文字16ptだった。Googleは`g.circle.fill`を使っていた。Appleの拒絶メッセージは「同等のログイン選択肢として表示されていない」とだけ述べており、これらのどれを審査員が問題にしたかは未確定。

公式素材の取得元は[ロゴ](https://developers.google.com/static/identity/images/g-logo.png)、[フォント](https://github.com/google/fonts/tree/main/ofl/googlesans)。元ファイルを使い、フォントのOFLを同梱する。画面の日本語表示に合わせてアプリの開発言語を日本語にする。

## 審査待ちのビルド差し替え

出典: [Appleの提出取り下げ手順](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/remove-a-submission-from-review)。取得日: 2026年10月7日。確度: 公式説明と同日のAPI実測。

審査待ちの提出を取り下げると、その提出の項目は審査の待ち列から外れ、アプリは`DEVELOPER_REJECTED`になる。再提出で審査はやり直しになる。

結では取消要求後の応答は`CANCELING`だったため、App Store版が`DEVELOPER_REJECTED`になるまで差し替えなかった。新ビルドの割当と審査説明を保存し、既存の認証情報・連絡先と手動公開設定を読み返して照合してから、新しい提出を送信した。iOS・Macともに新しい提出ID、提出とApp Store版の`WAITING_FOR_REVIEW`、審査項目の`READY_FOR_REVIEW`を確認した。

## 承認後の手動公開

出典: [Appleの公開方法](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/select-an-app-store-version-release-option/)、[公開要求API](https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-release-requests)。取得日: 2026年10月8日。確度: 公式仕様と同日のAPI実測。短い原文は[抜粋](ios-testflight/raw/apple-release-excerpts.md)へ保存した。

手動公開に設定したアプリは、審査通過後の`PENDING_DEVELOPER_RELEASE`で公開要求を送る。公開要求の成功と、利用者向けストアページへの反映は別に確認する。Appleは手動公開後の表示に最大24時間かかる場合があると説明している。

結のiOS版1.0（15）では、公開要求の後に`appVersionState=READY_FOR_DISTRIBUTION`、旧属性の`appStoreState=READY_FOR_SALE`になった。一方、直後の日本向けストアページは404、Lookup APIは0件だった。この段階では公開操作の成功までを確認済みとし、ストア表示と実機導入は反映待ちとして扱う。

同日、公開後約7分でストアページがHTTP 200になり、ブラウザにも「結 Yui」が表示された。その時点でもLookup APIは0件だったため、Lookupの結果だけでストア公開の成否を判定しない。

2026年10月10日、同じアプリ登録のMac版1.0（16）にも同じ公開要求APIを使い、`READY_FOR_DISTRIBUTION`を確認した。既にiOS版が公開済みのため公開URLは直後からHTTP 200を返すが、対応端末と互換性の表示はiOSのままだった。Lookup APIの`entity=macSoftware`もiOS版と同じ1件を返す。追加プラットフォームの反映は、HTTPの状態やLookupの件数でなく、ページの対応端末と互換性の表示で判定する。
