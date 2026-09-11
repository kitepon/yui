#!/usr/bin/env python3
"""SwitchBot Bot を BLE で押す。結が HTTP で呼ぶ口。"""

from __future__ import annotations

import asyncio
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from bleak import BleakClient, BleakScanner

CHAR = "cba20002-224d-11e6-9fb8-0002a5d5c51b"
PRESS = bytes.fromhex("570100")
MAC_RE = re.compile(r"[^0-9A-Fa-f]")


def normalize_mac(raw: str) -> str:
    hex_id = MAC_RE.sub("", raw)
    if len(hex_id) != 12:
        raise ValueError("MAC は 12 桁の hex")
    return ":".join(hex_id[i : i + 2] for i in range(0, 12, 2)).upper()


async def press(mac: str) -> None:
    address = normalize_mac(mac)
    device = await BleakScanner.find_device_by_address(address, timeout=20)
    if device is None:
        raise RuntimeError(f"{address} が見つかりません。ボットがサーバーの近くにあるか確認してください")
    async with BleakClient(device, timeout=20) as client:
        await client.write_gatt_char(CHAR, PRESS, response=True)


press_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[switchbot-ble] {self.address_string()} {fmt % args}")

    def _send(self, code: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            self._send(200, {"ok": True})
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/press":
            self._send(404, {"ok": False, "error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        try:
            payload = json.loads(self.rfile.read(length).decode() or "{}")
            mac = str(payload.get("mac") or "")
            with press_lock:
                asyncio.run(press(mac))
        except Exception as exc:
            self._send(502, {"ok": False, "error": str(exc)})
            return
        self._send(200, {"ok": True})


def main() -> None:
    bind = os.environ.get("SWITCHBOT_BLE_BIND", "127.0.0.1")
    port = int(os.environ.get("SWITCHBOT_BLE_PORT", "18862"))
    server = ThreadingHTTPServer((bind, port), Handler)
    print(f"[switchbot-ble] {bind}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
