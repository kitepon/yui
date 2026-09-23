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
| `YUI_SWITCHBOT_BLE_URL` | 任意 | SwitchBot Bot をサーバーの Bluetooth で押す口。例 `http://host.docker.internal:18862` |
| `COMPOSE_PROFILES` | 任意 | Bot 直結を使うなら `ble`。`switchbot-ble` サービスが起きる |
| `YUI_BIND` / `YUI_PORT` | 任意 | 受けるアドレスとポート（既定 `127.0.0.1:18861`） |
| `YUI_SUBNET` | 任意 | 容器の帯（既定 `172.16.240.0/24`） |
| `YUI_APP_ADDR` | 任意 | 容器の固定アドレス（既定 `172.16.240.10`）。`YUI_SUBNET` の中の空きにする。Smart Life の通知はここへ渡す |

**`HOME_SECRETS_KEY` を失うと、保存済みの家電トークンは復号できない。** 必ず控えを取る。

**LAN 直結（ダイキン・オーデリック・SwitchBot の Bluetooth 押し）は `YUI_LAN_OWNER` に書いた人だけが使える。**
これらは宛先をサーバーが持ち、利用者ごとの認証情報が無い。誰でも登録できる結で
開いたままにすると、登録した他人が家主の機器を操作できてしまう。書かなければ
LAN 直結は誰にも開かない。

Smart Life（Tuya）の機器は、接続タブの同期で機器ごとの鍵を受け取ったあと、結と同じ LAN にいるものは
クラウドを通さず直接読み書きする（Tuya ローカル version 3.1 と 3.3 の機器。3.4 / 3.5 はクラウドのまま）。
初回同期と新しい機器の鍵取得には Tuya IoT Platform が必要。保存済みの鍵は、クラウドの試用枠を使い切っても LAN 操作に使える。
機器は LAN へ UDP 6666（3.1）/ 6667（3.3 以降）で名乗る。`tuya-lan` がホストの LAN にその口を直接開き、受け取った datagram を容器（`YUI_APP_ADDR`）へ渡し、機器への TCP 6668 もホスト側で中継する。容器から家の LAN へは届かないので、受け役とのやりとりは共有の Unix ソケットだけを使う。ルーターの再起動でアドレスやリンクが変わると、口を閉じて開き直す。ウェブの待受は `127.0.0.1` のまま。
ホストに firewall があるなら LAN からの UDP 6666 と 6667 を通す（ufw なら
`ufw allow from 192.168.1.0/24 to any port 6666:6667 proto udp`。帯は自宅に合わせる）。
3.1 の古い機器は LAN 接続を 1 本しか受けず、Smart Life アプリが握っている間は結からの操作が失敗する（画面に理由が出る）。
どの機器が LAN で動いているかは接続タブの Smart Life カードに出る。この経路は利用者ごとの鍵で動くので
`YUI_LAN_OWNER` の制限は受けない。

接続タブと機器カードの表示は次のとおり。

| 表示 | 意味 |
|---|---|
| `LAN` | 直近30分以内に機器から読めた。名乗りが一時的に途切れても最後に読めた宛先で LAN を試す |
| `LAN不可` と理由 | 名乗りはあるが直結できない。鍵不足、未対応版、読取失敗などの理由を表示する |
| `クラウド（LAN に見つかりません）` | 有効な LAN の宛先が無い。Tuya のクラウド経路を使う |

対応版で鍵を持つ機器が LAN 読取に失敗した場合はクラウドへ切り替えない。鍵が無い機器と版 3.4 / 3.5 の機器はクラウドを使う。
`IoT Core trial quota is exhausted (28841004)` が出たらクラウド経路の枠を確認する。保存済みの鍵がある 3.1 / 3.3 機器で `LAN不可` が出る場合は、ホストから機器の TCP 6668 へ届くかと、`tuya-lan` の UDP 6666 / 6667・共有 Unix ソケットを確認する。アプリ容器からホストや家の LAN へ直接 TCP する構成にはしない。

SwitchBot の押すボットをハブ無しで動かすときは、サーバーに Bluetooth アダプタがあり、
ボットが電波の届くところにあること。`.env` に `COMPOSE_PROFILES=ble` と
`YUI_SWITCHBOT_BLE_URL=http://switchbot-ble:18862` を書く。

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
