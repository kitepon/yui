# 正式Alexaスキルの導入と配布記録

2026年10月4日の実施記録。

## 実施済み

- 「結ホーム」はAmazonの公開版が`live`で、正式なストアページも確認できた。新しいスキルを重複作成していない。
- WebとiPhoneの接続画面に、正式スキルを開くボタンと、有効化・結へのログイン・デバイス検出の手順を追加した。Webの旧Customスキルの案内を置き換えた。
- スキルの識別情報は`src/lib/alexa-skill.json`にまとめ、iPhoneにも同じファイルを同梱した。配布アーカイブ内のファイルと正本のSHA-256は一致した。
- 変更コミット`0a418fd`を`main`へpushし、`origin/main`の祖先であることを確認して本番へ配備した。イメージは`yuihome:20261004-0a418fd`。公開WebのHTTP 200と本番コンテナの正常起動を確認した。
- iPhoneの1.0（7）は署名付きアーカイブ、IPA書き出し、Apple検証、altoolアップロードが成功した。ビルドID`4252d30e-2956-4578-b714-03313c92b6a4`を既存の内部テストグループへ割り当て、`VALID`と`IN_BETA_TESTING`を確認した。

## 検証

- `npm run lint`、`npm run typecheck`、`npm test`（286件）、`npm run build:dev`が成功。本番ビルドと配備も成功。
- iPhoneの関連10試験は全件成功。試験後のXcodeのシミュレーター診断収集に約10分かかったが、最終的に`TEST SUCCEEDED`で終了し、xcresultも`Passed`・成功10件・失敗0件を返した。
- 公開Webの接続画面で、Jev Ultrafastが導入ボタンを1回押し、正式なAmazonページが別タブで開いた。開いた先の「結ホーム」、投稿者`kitepon.dev`、「無料で有効にする」を実際のDOMで確認した。
- iPhoneシミュレーターでも、接続画面のボタンからSafariへ移り、同じ正式スキルのページが表示された。スキルの有効化とアカウント再リンクは実行していない。
- Xcodeの画面取得とJev Desktopの`Simulator`指定は時間切れになった。端末画面を持つアプリは`Device Hub`として見えており、デスクトップ操作APIで既存のAppleサインイン画面をキャンセルして確認を続けた。Appleのログイン情報は入力していない。
- Jev Bookmarksは`no_entry`でブラウザを操作しなかったため、上流Jev Ultrafastへ公開URLを直接渡した。

## 一般公開の判断待ち

同日のApp Store Connectでは、1.0（5）が`PENDING_DEVELOPER_RELEASE`・手動公開待ちになっていた。
このビルドにはAlexaの導入ボタンと、ビルド6の画面自動更新が入っていない。
今回のビルド7はTestFlight配信まで完了しており、一般公開の審査対象はまだ変更していない。

Approval Boxの`K-89YLZD`で、審査済みビルド5をビルド7へ差し替えて再審査へ進めるか、
5を先に一般公開するか、一般公開を保留するかを申請した。推奨は7への差し替えと再審査。
回答が届いたら、その方針に従ってApp Store Connectで続行する。

実機のTestFlight更新と導入ボタンの操作は未確認。既存Alexa連携の再リンクは不要である。
