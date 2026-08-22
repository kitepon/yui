# 結（Yui）を自分のサーバーで動かす

家の機器と同じ LAN にいる小さなサーバー（ミニ PC、NAS、Raspberry Pi など）に置き、
リバースプロキシ越しに外から使う想定。ダイキン直結のような LAN 越しの操作は、
結が家の中にいないと届かない。

## 用意するもの

- Docker が動くサーバー（`linux/amd64` か `linux/arm64`）
- 外から使うなら、TLS を張るリバースプロキシ（Caddy、nginx、Cloudflare Tunnel など）
- ドメイン 1 つ（`BETTER_AUTH_URL` に書く）

## 秘密

`deploy/.env` に置く。リポジトリには入れない。

| 変数 | 要否 | 用途 |
|---|---|---|
| `BETTER_AUTH_SECRET` | 必須 | セッションの署名鍵。`openssl rand -hex 32` |
| `HOME_SECRETS_KEY` | 必須 | 家電トークンの暗号化鍵（32 バイト）。`openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 任意 | Google でログインする場合 |
| `ALEXA_CLIENT_ID` / `ALEXA_CLIENT_SECRET` | 任意 | Echo から使う場合（[docs/alexa.md](../docs/alexa.md)） |
| `YUI_BACKUP_URL` / `YUI_BACKUP_SECRET` | 任意 | 家データを外部へ定期退避する場合 |
| `BETTER_AUTH_URL` | 必須 | 外から見た公開 URL（例 `https://yui.example.com`） |
| `YUI_LAN_OWNER` | LAN 直結を使うなら必須 | この結の持ち主のメール。**この人だけ**が LAN 直結を使える |
| `YUI_DAIKIN_ADDRS` | 任意 | ダイキン直結の宛先。`部屋=IP` をカンマ区切り |
| `YUI_ODELIC_BRIDGE_URL` | 任意 | 自作オーデリックブリッジの URL（この repo には含まれない） |
| `YUI_BIND` / `YUI_PORT` | 任意 | 受けるアドレスとポート（既定 `127.0.0.1:18861`） |

**`HOME_SECRETS_KEY` を失うと、保存済みの家電トークンは復号できない。** 必ず控えを取る。

**LAN 直結（ダイキン・オーデリック）は `YUI_LAN_OWNER` に書いた人だけが使える。**
これらは宛先をサーバーが持ち、利用者ごとの認証情報が無い。誰でも登録できる結で
開いたままにすると、登録した他人が家主の機器を操作できてしまう。書かなければ
LAN 直結は誰にも開かない。

## 起動

```bash
docker build -t yuihome:local .
```

```bash
cd deploy && docker compose up -d
```

家に固有の値はすべて `.env` が持つので、`compose.yaml` は書き換えなくていい。
状態は named volume `yuihome_yui-data`（`/data/yui.sqlite`）に残り、image を入れ替えても消えない。

手元の Mac などから焼いて送り込むなら、同梱のスクリプトが使える。

```bash
DEPLOY_HOST=user@192.168.0.2 ./scripts/deploy-prod.sh
```

## 更新

新しい image を焼いて `docker compose up -d` する。tag を `日付-短sha` のように固定しておくと、
戻したいときに `image:` を古い tag へ書き換えるだけで済む。`latest` は使わない方がいい。

## 予備の復旧

`YUI_BACKUP_URL` を設定している場合だけ使える。今の家データを上書きするので、自動では走らない。

```bash
curl -fsS -X POST https://<自分のホスト>/api/ops/backup \
  -H "Authorization: Bearer $YUI_BACKUP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"op":"restore"}'
```

`{"op":"backup"}` を送れば、その時点の中身を先に押せる。
