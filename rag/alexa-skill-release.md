# Alexa「結ホーム」の公開確認

出典: Amazon Developer Consoleの公式スキル登録データとAmazon.co.jpのストアページ。
取得日: 2026年10月4日。確度: 登録データと公開ページを実測。

2026年8月23日に審査へ提出したスキルは、8月24日に公開されていた。
開発者コンソールの公開版は`live`で、ストアページには「結ホーム」、投稿者`kitepon.dev`、
「無料で有効にする」、アカウントリンクとデバイス検出の手順が表示された。
審査中のまま残っていた`docs/alexa.md`は更新した。

公開スキルの識別情報は [alexa-skill.json](../src/lib/alexa-skill.json) にまとめる。
このスキルのアカウントリンク先は公式hosted版である。
自分のサーバーの結アカウントを、公式スキルへリンクすることはできない。

WebとiPhoneからはAmazonのHTTPSストアページを開く。
有効化・アカウントリンク・デバイス検出はAmazonの画面で利用者が行う。
iPhoneのリンクは[SwiftUIのLink](https://developer.apple.com/documentation/swiftui/link)を使う。

導入ボタンの公開後確認、iPhoneのTestFlight配布、一般公開の判断待ちは
[実施記録](../docs/alexa-skill-install-status.md)にまとめた。
