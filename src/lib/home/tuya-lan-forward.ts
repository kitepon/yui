/**
 * ホストの LAN で Smart Life の名乗り（UDP 6666 / 6667）を受け、容器へ渡す。
 *
 * 容器の中のソケットは、ルーター再起動で黙ったホストの口を開き直せない。
 * このプロセスは host network で動き、アドレスかリンクが変わると bind し直す。
 * 渡す先のポート番号は、listen した番号と同じ。ネットワークが違うので重ならない。
 */
import { startTuyaLanForwarder } from "./lan-udp.ts";

startTuyaLanForwarder();
