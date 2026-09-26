出典: [Apple Authentication Services](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service)、[Better Auth OAuth](https://better-auth.com/docs/concepts/oauth)、この repository の実装と iOS 17.0 simulator ビルド
取得日: 2026-09-26
確度: 公式仕様とローカルビルドで確認。Google 本人ログインの完走は未確認。

# iPhone の Google 認証

Apple の `ASWebAuthenticationSession` は、サービスの Web 認証を iOS アプリから開き、
コールバック URL を呼出元のアプリへ返す。iOS 17.0 を対象にする場合、
`init(url:callbackURLScheme:completionHandler:)` が使える。
`init(url:callback:completionHandler:)` は iOS 17.4 以降なので、この製品では使わない。

Better Auth は `auth.api.signInSocial` で Google 認証 URL を生成できる。
`disableRedirect: true` で URL を JSON に受け、`Set-Cookie` をブラウザへの 302 に引き継ぐ。
OAuth 後のセッション Cookie はブラウザ側にあるため、ネイティブの `URLSession` に直接共有されない。
この製品では結サーバーがセッションを確認して短命の使い捨てコードを発行し、
アプリが PKCE verifier を提示して引き換える。セッション本体は callback URL に載せない。

原文抜粋は [Apple](ios-auth/raw/apple-aswebauth.md) と [Better Auth](ios-auth/raw/better-auth-oauth.md)。
