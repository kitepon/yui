# Changelog

## 2026-08-28

本番 image `yuihome:20260828-f954a15`。

### 変わったこと

- ダイキン直結の風向に「自動」を足した（自動 100000 / 固定 000000 / スイング 0F0000）
- 自動運転で相対温度（p_1F）を読み書きする。外気温を表示する

### 限界

- 風向の固定羽根の多段位置は未解読
- パワフル・ストリーマなど、符号が実測で確定していない項目は出さない

## 2026-08-28

本番 image `yuihome:20260828-e15ff23`。

### 変わったこと

- オートメーションと場面で、画面に出ている初期値を触らなくても保存する。一覧と実行に、見た項目が載る
- センサー条件に「範囲内」を足した。範囲に入っているあいだ、いまの設定と違うときだけ送る
- 範囲条件は、設定を読み返せる機器だけに使える（ダイキン直結、Nature Remo のエアコン・照明、SwitchBot の実機、Smart Life）

### 限界

- すでに空のまま残っているアクションは、編集して保存し直すまで空のまま
- 時刻だけ欠けている記録は、読み込み時に 7:00 毎日とする
- 赤外線リモコン（SwitchBot IR・学習リモコン）とオーデリックには範囲条件を使えない
- 範囲の外では何もしない。以上・以下は、満たしているあいだ一度きり

## 2026-08-27

本番 image `yuihome:20260827-ca64b04`。

### 変わったこと

- オートメーションのセンサーしきい値（気温・湿度・照度）を、小数点第一位まで設定できる
- 室温がしきい値を下回っても、古い pass 記録のまま黙らない
- サーバーの確認周期で SwitchBot のセンサー値も取り直す

### 限界

- 時刻の時・分・間隔は整数のまま
- 条件を満たしているあいだは、一度動いたら、一度しきい値の外側へ出て戻るまで再発火しない

## 2026-08-26

本番 image `yuihome:20260825-b21e822`。

### 変わったこと

- Nature Remo・SwitchBot・Smart Life の機器種別と操作を、Home Assistant の機器表に合わせて広げた
- Nature Remo のエアコンで風量と風向（上下スイング／固定）を読み書きする
- SwitchBot は同期時に状態を取り、IR エアコンは温度・モード・風量をまとめて送る
- Smart Life は照明の明るさ、カーテンの開き、エアコンの温度などを、機器が持つ項目だけ送る
- Smart Life のセンサー（水温計を含む）は、空のときだけでなく毎分 status を取り直す。一覧の古い温度を残さない

### 限界

- Home Assistant 自体は同梱しない
- 掃除機・加湿器など、結に kind が無い機器は詳細操作を出さない
- Nature Remo の風向は左右の独立指定をしない
- Smart Life の表に無い category は other

## v0.1.0 — 2026-08-23

結 Yuiの最初の公開snapshotです。

### 届けるもの

- Nature Remo、SwitchBot、Smart Life（Tuya）を一つのホーム画面へ統合
- 対応するダイキンエアコンへLANから直接接続
- 複数機器を動かす場面と、時刻・機器・sensorを条件にしたserver-side automation
- Alexa Smart HomeとiPhoneのホーム画面追加
- Better Authによる認証、AES-256-GCMによる家電token暗号化、SQLite永続化
- MITのself-hosted版と、`yuihome.kitepon.dev`の公式hosted版

公式hosted版は月額100円または年額1,000円（税込）、初回30日間無料です。
self-hosted版は無料で、機能制限はありません。

### 現在の保証範囲

- ダイキン直結は2020年うるさらX 1機種で実測済み。同世代の他機種は未検証
- 2018年以前の後付けダイキンadapter（旧API）は未対応
- オーデリックのprotocolとprivate bridgeは配布対象外
- native iPhone appとproduction Cloudflare移転は後続工程
- `v0.x`の間はdatabase schema、設定、self-hosted upgradeの長期互換をまだ保証しない

不具合と対応機種の報告は[GitHub Issues](https://github.com/kitepon/yui/issues)、
脆弱性は[非公開の報告窓口](https://github.com/kitepon/yui/security/advisories/new)で受け付けます。
