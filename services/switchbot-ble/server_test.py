#!/usr/bin/env python3
"""Bluetooth 押し口のイベントループを使い回すこと。"""

from __future__ import annotations

import asyncio
import inspect
import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import server


class NormalizeMacTest(unittest.TestCase):
    def test_colon_and_bare(self) -> None:
        self.assertEqual(server.normalize_mac("d382f7434eb5"), "D3:82:F7:43:4E:B5")
        self.assertEqual(server.normalize_mac("D3:82:F7:43:4E:B5"), "D3:82:F7:43:4E:B5")

    def test_rejects_short(self) -> None:
        with self.assertRaises(ValueError):
            server.normalize_mac("abc")


class BleLoopTest(unittest.TestCase):
    def setUp(self) -> None:
        self.loop = server.BleLoop()
        self.loop.start()

    def tearDown(self) -> None:
        self.loop.stop()

    def test_reuses_the_same_running_loop(self) -> None:
        seen: list[int] = []

        async def record() -> None:
            seen.append(id(asyncio.get_running_loop()))

        self.loop.run(record())
        self.loop.run(record())
        self.assertEqual(len(seen), 2)
        self.assertEqual(seen[0], seen[1])
        self.assertEqual(seen[0], id(self.loop.loop))

    def test_propagates_coroutine_error(self) -> None:
        async def boom() -> None:
            raise RuntimeError("ボットが応答しませんでした")

        with self.assertRaisesRegex(RuntimeError, "応答しませんでした"):
            self.loop.run(boom())

    def test_does_not_call_asyncio_run(self) -> None:
        async def noop() -> None:
            return None

        with patch("asyncio.run", side_effect=AssertionError("asyncio.run を呼んではいけない")):
            self.loop.run(noop())


class RunPressTest(unittest.TestCase):
    def setUp(self) -> None:
        self.loop = server.BleLoop()
        self.loop.start()
        server.ble_loop = self.loop

    def tearDown(self) -> None:
        server.ble_loop = None
        self.loop.stop()

    def test_press_runs_on_shared_loop(self) -> None:
        seen: list[int] = []

        async def fake_press(mac: str) -> None:
            seen.append(id(asyncio.get_running_loop()))
            self.assertEqual(mac, "aa:bb")

        with patch.object(server, "press", fake_press):
            server.run_press("aa:bb")
            server.run_press("aa:bb")
        self.assertEqual(seen, [id(self.loop.loop), id(self.loop.loop)])

    def test_http_press_does_not_use_asyncio_run(self) -> None:
        async def fake_press(mac: str) -> None:
            return None

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            port = httpd.server_address[1]
            with (
                patch.object(server, "press", fake_press),
                patch("asyncio.run", side_effect=AssertionError("asyncio.run を呼んではいけない")),
            ):
                conn = HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("POST", "/press", body=json.dumps({"mac": "d382f7434eb5"}), headers={"Content-Type": "application/json"})
                res = conn.getresponse()
                body = json.loads(res.read().decode())
                conn.close()
            self.assertEqual(res.status, 200)
            self.assertEqual(body, {"ok": True})
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=5)

    def test_handler_source_has_no_asyncio_run(self) -> None:
        self.assertNotIn("asyncio.run", inspect.getsource(server.Handler.do_POST))
        self.assertNotIn("asyncio.run", inspect.getsource(server.run_press))


if __name__ == "__main__":
    unittest.main()
