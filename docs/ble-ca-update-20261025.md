# SwitchBot BLE中継のCA更新（2026-10-25）

BLE中継の旧イメージは、DebianのCAパッケージが20250419~deb12u1で、通常のPython TLS信頼ストアにemSign ECC Root CA - G3とAAA Certificate Servicesが残っていた。app・Tuya LANのNode更新とは別のイメージであり、その更新だけではBLEは修正されない。

原因は、BLEのDockerfileが可変のPythonベースを使い、CAの版と信頼ストアの内容を検査していなかったこと。通常配備のBLEビルドも古いベースを再利用できた。

Python3.12.15の公式bookwormイメージをdigestで固定し、CAパッケージを20250419~deb12u2へ固定した。bleak1.1.1とdbus-fast5.2.0は旧稼働と同じ版へ固定した。依存導入後にビルド専用pipを取り除き、そのvendor certifiの古い別束を実行環境へ残さない。ビルド時に通常のPython TLSストアを検査し、修正前のCA・G3/AAA残存・G1欠落・検証無効・予期しないpip/certifi残存を拒否する。BLEのサーバー処理、HTTPの振る舞い、Bluetooth権限やD-Bus接続は変更しない。

専用イメージの通常ビルドでも検査が必ず動く。配備スクリプトは検査ファイルも送ってビルドするため、通常経路から検査を外さない。

## 検証

- PythonのBLE関連テスト10件、lint・型検査・全364件・開発ビルドが成功。
- 旧稼働はCA150枚、G3/AAAあり。最終候補はCA148枚、G3/AAAなし、G1保持。旧イメージは同じ検査器で失敗した。
- 本番データ・秘密・D-Busマウント・公開ポートなしの隔離容器で、通常server起動、`/health` 200、不正MACの押下要求を拒否、再起動0を確認した。
- 通常のPython TLS検証でpython.orgとpypi.orgへ接続し200を確認した。TLSとホスト名の検証は有効。
- 初回OSのみ更新候補はpip内の別束残存が分かったため採用しない。最終候補は実行依存を保持してpipを除去し、再確認した。

本番切替前の準備記録。実家電の押下は行っていない。BLE一つだけの許可下切替と、appからの通常health、稼働中の束・起動・設定保持の確認、独立監査は別工程として扱う。
