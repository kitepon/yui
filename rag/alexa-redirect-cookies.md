# AlexaアカウントリンクのCookie結合と500エラー

出典: [TanStack Routerの不具合報告7755](https://github.com/TanStack/router/issues/7755)、インストール済みライブラリ、結の稼働ログと再現試験。取得日: 2026年10月4日。確度: ローカル再現と修理後試験で確認。

セッションCookieが更新される認可要求で、`Response.redirect()`の変更不可ヘッダーへTanStack StartがCookieを結合し、`TypeError: immutable`とHTTP 500を返す。Cookieが更新されない未認証要求では正常に302を返すため、単純な未認証アクセスだけでは再現できない。

結のAlexa認可処理は、変更可能なヘッダーを持つ302応答を返すよう修理した。アカウントリンクの方式と認証情報は変更しない。
インストール済みTanStackのリクエスト処理を使い、Cookieを設定してからAlexaの認可コード・stateを含む戻り先へ転送する試験を追加した。旧処理は500、新処理はCookie・戻り先を保った302となった。

本番の16時09分の2回の500は同じスタックだった。ただし、そのエラーと個々の音声操作の失敗が同じ要求であるとは断定していない。
短い[一次資料抜粋](alexa-redirect-cookies/raw/tanstack-excerpt.md)を別に保存した。
