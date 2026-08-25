# 結 Yui — プロジェクト正典

## 製品

結は、Nature Remo、SwitchBot、Smart Life、対応するダイキンエアコンを一枚の画面で扱う
ホームアプリである。公式hosted版は`https://yuihome.kitepon.dev`、self-hosted版はMITで公開する。
ブランド所有者は`kitepon.dev`、公式repositoryは`https://github.com/kitepon/yui`である。

製品境界と技術判断は`docs/00_direction.md`、配備方法は`deploy/README.md`を正とする。
Grok App Builder由来の一般テンプレートや`.grok/skills/auth`と矛盾する場合は、本書と
`docs/00_direction.md`を優先する。

## 守ること

- 認証、家電tokenの暗号化、1ユーザー1家、SQLite、`tickAllHomes()`の境界を勝手に変えない。
- 公式hosted版の課金とself-hosted版の無料利用を混同しない。
- オーデリックのprotocolやbridge本体をrepositoryへ含めない。
- Home Assistant 本体を repository や runtime へ入れない。機器表の写し（`src/lib/home/ha-catalog.ts`）だけを持つ。
- production secret、家電token、利用者情報、Stripe情報をcommitしない。
- 公開metadata、README、Release、support/security窓口は実装済みの範囲と限界だけを書く。

## 変更の受入

変更に直結するfocused testを先に実行し、完了時に`npm run lint`、`npm run typecheck`、
`npm test`、`npm run build:dev`を通す。本番変更は対象commitが`origin/main`の祖先であることを
確認して配備し、公開URLで該当導線を確認する。通常の変更はcommit後に`main`へpushして届ける。
