#!/usr/bin/env python3
"""SwitchBot Bot を BLE で押す。結が HTTP で呼ぶ口。"""

from __future__ import annotations

import asyncio
import json
import os
import re
import threading
from collections.abc import Coroutine
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, TypeVar

WRITE_CHAR = "cba20002-224d-11e6-9fb8-0002a5d5c51b"
READ_CHAR = "cba20003-224d-11e6-9fb8-0002a5d5c51b"
PRESS = bytes.fromhex("570100")
MAC_RE = re.compile(r"[^0-9A-Fa-f]")

T = TypeVar("T")


def normalize_mac(raw: str) -> str:
    hex_id = MAC_RE.sub("", raw)
    if len(hex_id) != 12:
        raise ValueError("MAC は 12 桁の hex")
    return ":".join(hex_id[i : i + 2] for i in range(0, 12, 2)).upper()


class BleLoop:
    """プロセスで一つのイベントループ。押すたびに asyncio.run すると
    BlueZ の D-Bus 接続がループごとに増え、UID 0 の上限 256 で死ぬ。"""

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, name="ble-loop", daemon=True)
        self._ready = threading.Event()

    def _run(self) -> None:
        asyncio.set_event_loop(self.loop)
        self._ready.set()
        self.loop.run_forever()

    def start(self) -> None:
        self._thread.start()
        if not self._ready.wait(timeout=5):
            raise RuntimeError("BLE ループが起きませんでした")

    def alive(self) -> bool:
        return self._thread.is_alive() and self.loop.is_running()

    def run(self, coro: Coroutine[Any, Any, T]) -> T:
        if not self.alive():
            coro.close()
            raise RuntimeError("BLE ループが止まっています")
        fut = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return fut.result()

    def stop(self) -> None:
        if self.loop.is_running():
            self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(timeout=5)
        if not self.loop.is_closed():
            self.loop.close()


async def press(mac: str) -> None:
    from bleak import BleakClient, BleakScanner

    address = normalize_mac(mac)
    device = await BleakScanner.find_device_by_address(address, timeout=20)
    if device is None:
        raise RuntimeError(f"{address} が見つかりません。ボットがサーバーの近くにあるか確認してください")
    async with BleakClient(device, timeout=20) as client:
        loop = asyncio.get_running_loop()
        done: asyncio.Future[bytes] = loop.create_future()

        def on_notify(_sender: object, data: bytearray) -> None:
            if not done.done():
                done.set_result(bytes(data))

        await client.start_notify(READ_CHAR, on_notify)
        await client.write_gatt_char(WRITE_CHAR, PRESS, response=False)
        try:
            result = await asyncio.wait_for(asyncio.shield(done), timeout=5)
        except TimeoutError as exc:
            raise RuntimeError("ボットが応答しませんでした") from exc
        if result == b"\x07":
            raise RuntimeError("ボットにパスワードが必要です")
        if result == b"\t":
            raise RuntimeError("ボットのパスワードが違います")
        if not result or result[0] not in (1, 5):
            raise RuntimeError(f"ボットが拒否しました（{result.hex()}）")


ble_loop: BleLoop | None = None
press_lock = threading.Lock()


def run_press(mac: str) -> None:
    if ble_loop is None:
        raise RuntimeError("BLE ループが未起動です")
    with press_lock:
        ble_loop.run(press(mac))


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
            run_press(mac)
        except Exception as exc:
            self._send(502, {"ok": False, "error": str(exc)})
            return
        self._send(200, {"ok": True})


def main() -> None:
    global ble_loop
    ble_loop = BleLoop()
    ble_loop.start()
    bind = os.environ.get("SWITCHBOT_BLE_BIND", "127.0.0.1")
    port = int(os.environ.get("SWITCHBOT_BLE_PORT", "18862"))
    server = ThreadingHTTPServer((bind, port), Handler)
    print(f"[switchbot-ble] {bind}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
