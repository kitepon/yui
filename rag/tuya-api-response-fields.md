# Tuya Cloud API の機器一覧と DP 応答

取得日: 2026-09-23。確度: 公式 API 文書と結の本番データで確認。ページ上限と応答フィールドは Tuya 文書を正とする。

- [Query Devices in Project](https://developer.tuya.com/en/docs/cloud/734e8088a6?id=Kcspwthd1f5tb) の `/v2.0/cloud/thing/device` は、機器の LAN 鍵を `localKey`、接続状態を `isOnline`、製品名を `productName` で返す。古い API の `local_key` / `online` / `product_name` と併せて読む必要がある。
- 同じ機器一覧 API の `page_size` は最大20。20台以上は `last_id` で続きを取得する。
- [Get Device Specification Attribute](https://developer.tuya.com/en/docs/archived-documents/f2c0abfbbd?id=Kb26d4cf4wnrd) の `/v1.1/devices/{device_id}/specifications` は、項目表では DP 番号を `dp_id` と記す一方、応答例は `dpId` を使う。どちらも機器の DP 番号として読む。
- [Global Error Codes](https://developer.tuya.com/en/docs/iot/error-code?id=K989ruxx88swc) の `28841004` は IoT Core の Trial Edition 枠の消尽を表す。LAN 用の鍵と DP 対応が保存済みの機器では、このエラーを LAN 操作の可否判定に使わない。
