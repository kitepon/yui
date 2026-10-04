# TanStack Routerの不具合報告7755の抜粋

出典: https://github.com/TanStack/router/issues/7755 。取得日: 2026年10月4日。確度: 一次報告と結のローカル再現を照合。

Cookie結合処理で例外を出す行:

```ts
response.headers.delete("set-cookie");
```

変更可能なヘッダーを返す構築方法:

```ts
new Response(null, { status: 302, headers: { location: url } })
```
