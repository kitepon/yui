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

**`HOME_SECRETS_KEY` を失うと、保存済みの家電トークンは復号できない。** 必ず控えを取る。

## 起動

```bash
docker build -t yuihome:local .
```

```bash
cd deploy && docker compose up -d
```

`deploy/compose.yaml` は雛形なので、`BETTER_AUTH_URL` と LAN 直結の宛先（`YUI_DAIKIN_ADDRS`）を
自分の家に合わせて書き換える。状態は named volume `yuihome_yui-data`（`/data/yui.sqlite`）に残り、
image を入れ替えても消えない。

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
