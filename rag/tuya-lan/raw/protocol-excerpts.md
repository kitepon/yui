# Tuya 3.1の応答形式

出典: [TinyTuya PROTOCOL.md](https://github.com/jasonacox/tinytuya/blob/master/PROTOCOL.md#decryption-rules)。取得日: 2026年10月4日。確度: 上流実装の一次資料。結の実機でも操作後に3.1形式の通知を受信した。

> If payload starts with `b"3.1"`, strip version + 16 md5 chars, base64‑decode remainder, AES‑ECB decrypt, unpad -> JSON.
