# オーデリック照明3台の操作不能と復旧

2026年10月10日の実施記録。結のコードに欠陥は無く、自宅サーバー（MS-A2）の非公開`odelic-bridge`が錨を失っていた。

## 現在の状態

復旧済み。19時43分38秒にブリッジからキッチンへONを1回送り、HTTP 200・送信成立・照明から点灯状態「0a 07」が返った。
ブリッジは`/health`で`connected:true`、`authed:true`、探索は有効。非公開リポジトリの`4b21461`と`f986251`を導入済みで、
サーバー上の配備物は`origin/main`のHEADと一致する。

## 原因（全部実測）

- 06時17分42秒にUbuntuの自動更新（unattended-upgrades）が`bluez`を5.85-4ubuntu0.1から0.3へ更新し、
  06時18分17秒に`bluetooth.service`が再起動した。
- bluetoothdが替わると、ブリッジが起動時に1回だけ登録していたBLE広告（照明が繋いでくる錨）・GATT・探索が全部消える。
  ブリッジのプロセスは生きていて`/health`は`ok:true`だったが、`connected:false`、06時18分17秒の
  「照明が購読を停止した（切断）」以降は再接続がゼロだった。
- 3台の操作は1本のBLE接続を通る共通経路なので、未接続だとブリッジは`deferred:true`を返し、
  結は3台とも「照明がまだ繋がっていない」で失敗する。全滅はこれが理由。
- 結のコンテナ、`YUI_ODELIC_BRIDGE_URL`、結からブリッジへのHTTP到達は正常だった。

## 止血

19時10分に`sudo systemctl restart odelic-bridge`。19時10分50秒に照明が再接続し認証成立。

## 修理（所有者は非公開odelic-bridge）

- unitへ`PartOf=bluetooth.service`を付け、bluetoothdの再起動（自動更新・`Restart=on-failure`の復帰）に合わせて
  ブリッジも止まって立ち直る。
- アダプタに`LEAdvertisingManager1`が登録され`Powered`になるまで待ってから錨を立てる。bluetoothdはその直前に
  既存の広告インスタンスを全消去するため、先に立てると消される。systemdは`org.bluez`の名前取得で後続を起動するので、
  この待ちが無いと1ミリ秒差の競合になる。
- bluetoothdの強制終了後は前のLEスキャンがカーネルに残り（最長10.24秒）、その間の`StartDiscovery`は
  `InProgress`で登録を捨てられる。終了はD-Busへ通知されないので、窓が閉じた後に有限回だけ登録し直す。
- 終了処理はbluetoothdが居る時だけD-Busを呼ぶ。居ない時に呼ぶとD-Bus起動要求で25秒固まり、exit 1で落ちていた。

## 実証

- 非公開ブリッジ34試験が成功。
- `systemctl restart bluetooth`（原因と同じ経路）: ブリッジが追従して立ち直り、照明が4秒で再認証。
- `kill -9 bluetoothd`を4回: 4回とも再登録が成立し、ブリッジの異常終了ゼロ、探索有効、照明が再認証。
- 結・Web・iPhoneの実装は変更していない。結からの3台操作は所有者の実機確認を残す。

計測した事実と判断は非公開リポジトリの`rag/bluez-restart/summary.md`に置いた。
10月4日の記録は[alexa-operation-recovery.md](alexa-operation-recovery.md)。
