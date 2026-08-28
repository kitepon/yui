# 結 Yui

<p align="center">
  <img src="public/images/living.jpg" alt="結 Yuiのホーム画面" width="896">
</p>

<p align="center">
  家の機器を、一枚に。<br>
  Nature Remo、SwitchBot、Smart Life、ダイキンを、メーカーの境界を越えてまとめるホームアプリ。
</p>

<p align="center">
  <a href="https://yuihome.kitepon.dev">公式hosted版</a> ·
  <a href="deploy/README.md">self-hostする</a> ·
  <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/kitepon/yui/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/kitepon/yui/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-37584b"></a>
  <a href="https://yuihome.kitepon.dev"><img alt="Hosted" src="https://img.shields.io/badge/hosted-yuihome.kitepon.dev-bb4d36"></a>
</p>

## 30秒でわかること

- **機器をまとめる** — Nature Remo、SwitchBot、Smart Life（Tuya）を一つの画面へ。名前と置き場所は自由に付け替えられます。
- **ダイキンへLANから直結** — 対応エアコンをcloudを通さず操作。実機が申告するmodeと温度範囲だけを表示します。風向は自動・固定・スイング。自動運転の相対温度と外気温も扱います。
- **場面とautomation** — 「おやすみ」で複数機器を動かし、時刻やsensor値をきっかけにserver側で実行します。画面に出ている設定は、触らなくても保存します。センサーのしきい値は小数点第一位まで入れられます。範囲内なら、いまの設定と違うときだけ送ります（設定を読み返せない赤外線には使えません）。
- **iPhoneのホーム画面へ** — Safariからホーム画面へ追加すれば、appのように使えます。Echo対応（Alexa Smart Home）は実装済みで、公式スキル「結ホーム」はAmazonの審査中です（2026-08-23提出）。公開までの間も、自分のserverで動かす場合は[docs/alexa.md](docs/alexa.md)の手順で自分のスキルとして使えます。

機種が対応していない操作は、押せるふりをして表示しません。動かせる範囲を機器ごとに確かめ、
メーカーをまたぐ家の操作を一枚へ戻すことが、結の中心です。

## クラウド接続で動く範囲

結は Home Assistant を同梱しません。種別の見分けは [Home Assistant core](https://github.com/home-assistant/core) の機器表を写したものです。
接続したあと、各社を再同期すると新しい欄が載ります。

- **Nature Remo** — センサー、エアコン（温度・モード・風量・風向）、照明、学習済み赤外線。風向は上下スイングと固定です。左右の独立指定はしません。
- **SwitchBot** — ボット、コンセント、照明、カーテン、鍵、温湿度などのセンサー、IR エアコン（温度・モード・風量）。掃除機と加湿器は一覧に出ますが、結に kind が無いので詳細操作は出しません。
- **Smart Life** — 照明（明るさ）、コンセント、カーテン、エアコン、温湿度・水温などのセンサー。操作はその機器が持つ項目だけを送ります。表に無い category は other です。

## 使い方を選ぶ

|            | 公式hosted版                                       | self-hosted版                        |
| ---------- | -------------------------------------------------- | ------------------------------------ |
| URL / 手順 | [yuihome.kitepon.dev](https://yuihome.kitepon.dev) | [deploy/README.md](deploy/README.md) |
| 料金       | 月額100円または年額1,000円（税込）                 | 無料                                 |
| 試用       | 初回30日間無料                                     | 制限なし                             |
| 運用       | kitepon.devが運用                                  | 自分のserverで運用                   |
| 機能       | 同じ                                               | 同じ                                 |

公式hosted版は、serverを持たない人向けに運用の手間ごと提供しています。software自体はMITで、
self-hosted版に機能制限はありません。

## Self-hostを始める

```bash
npm install
npm run dev
```

開発時は`http://localhost:8080`。productionはDockerで動かし、reverse proxyの後ろに置きます。
詳細は[配備手順](deploy/README.md)を参照してください。

必須の値は`BETTER_AUTH_SECRET`、`HOME_SECRETS_KEY`、`BETTER_AUTH_URL`です。
`HOME_SECRETS_KEY`は家電tokenの暗号化鍵で、失うと保存済みtokenを復号できません。

ダイキン直結を使う場合は`YUI_DAIKIN_ADDRS`（例: `リビング=192.168.0.10`）を設定し、
結を家と同じLANで動かします。

## 技術とsecurity

- TanStack Start（React）+ SQLite、認証はBetter Auth
- 家電tokenはAES-256-GCMで暗号化し、API responseへ平文を載せない
- automationはserver側の1分ごとの`tickAllHomes()`で実行
- 製品判断の正本は[docs/00_direction.md](docs/00_direction.md)

脆弱性は公開Issueへ書かず、[SECURITY.md](SECURITY.md)の非公開窓口から報告してください。
一般の不具合、対応機種の実測、改善提案は[GitHub Issues](https://github.com/kitepon/yui/issues)で受け付けます。
修正提案は[CONTRIBUTING.md](CONTRIBUTING.md)を参照してください。

## 現在の限界

- **オーデリック照明** — 作者の家では自作bridge経由で動いていますが、このrepositoryはprotocolやbridge本体を配布しません。法的境界は[docs/00_direction.md](docs/00_direction.md)に記録しています。
- **古い世代のダイキン** — 2018年以前の後付けadapter（旧API）は未対応です。
- **ダイキンの検証範囲** — 2020年うるさらX 1機種で実測しています。同世代でも他機種は未検証です。
- **クラウド家電** — 表に無い機種、掃除機・加湿器、Nature Remo の左右風向は未対応です。Smart Life は機器が持たない操作を出せません。
- **upgrade保証** — `v0.x`ではdatabaseや設定の長期互換範囲をまだ保証していません。Release noteで変更点を確認してください。
- iPhone native appとCloudflareへの実移転は後続工程です。

## ブランドとlicense

結は[kitepon.dev](https://kitepon.dev)が運営・支援するIndependent Productです。
「面白いを見つけ、面白いを動かす。」というkitepon.devの姿勢を、毎日の家の操作へ届けます。

MIT（[LICENSE](LICENSE)）。無保証。家の機器を扱うsoftwareなので、自分の環境で確かめてから使ってください。

変更履歴は[CHANGELOG.md](CHANGELOG.md)に記録します。
