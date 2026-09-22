import assert from "node:assert/strict";
import { createSocket, type Socket } from "node:dgram";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, type NetworkInterfaceInfo } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assembleLanSnapshot,
  lanSnapshotChanged,
  listenLanUdp,
  readCarrierLinks,
  startTuyaLanForwarder,
} from "./lan-udp.ts";

function iface(address: string): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal: false,
    cidr: `${address}/24`,
  };
}

function waitFor(pred: () => boolean, label: string): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (pred()) {
        resolve();
        return;
      }
      if (Date.now() - start > 1000) {
        reject(new Error(label));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function closeSocket(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    socket.close(() => resolve());
  });
}

test("IPv4 か carrier が変わったときだけ開き直す", () => {
  const root = mkdtempSync(join(tmpdir(), "yui-lan-"));
  try {
    mkdirSync(join(root, "lo"));
    writeFileSync(join(root, "lo", "carrier"), "1\n");
    mkdirSync(join(root, "eth0"));
    writeFileSync(join(root, "eth0", "carrier"), "1\n");
    const up = assembleLanSnapshot({ eth0: [iface("192.168.1.20")] }, readCarrierLinks(root));
    writeFileSync(join(root, "eth0", "carrier"), "0\n");
    const down = assembleLanSnapshot({ eth0: [iface("192.168.1.20")] }, readCarrierLinks(root));
    const moved = assembleLanSnapshot({ eth0: [iface("192.168.1.21")] }, readCarrierLinks(root));
    assert.deepEqual(up.links, ["eth0=1"]);
    assert.equal(lanSnapshotChanged(up, up), false);
    assert.equal(lanSnapshotChanged(up, down), true);
    assert.equal(lanSnapshotChanged(down, moved), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

async function freeUdpPort(): Promise<number> {
  const socket = createSocket({ type: "udp4" });
  await new Promise<void>((resolve) => {
    socket.bind(0, "127.0.0.1", () => resolve());
  });
  const port = (socket.address() as { port: number }).port;
  await closeSocket(socket);
  return port;
}

test("bind し直したあとも、同じポートで datagram を受ける", async () => {
  const port = await freeUdpPort();
  const got: string[] = [];
  let bound = 0;
  const listen = listenLanUdp({
    ports: [port],
    watch: false,
    onMessage: (msg) => got.push(msg.toString()),
    onPortListening: (actual) => {
      bound = actual;
    },
  });
  const client = createSocket({ type: "udp4" });
  try {
    await listen.ready;
    assert.equal(bound, port);
    client.send(Buffer.from("one"), port, "127.0.0.1");
    await waitFor(() => got.includes("one"), "最初の datagram が来ない");
    await listen.rebind();
    assert.equal(bound, port);
    client.send(Buffer.from("two"), port, "127.0.0.1");
    await waitFor(() => got.includes("two"), "開き直したあとの datagram が来ない");
  } finally {
    await closeSocket(client);
    await listen.close();
  }
});

test("受けた datagram を上流のポートへ渡す", async () => {
  const upstream = await new Promise<Socket>((resolve) => {
    const socket = createSocket({ type: "udp4" });
    socket.bind(0, "127.0.0.1", () => resolve(socket));
  });
  const upstreamPort = (upstream.address() as { port: number }).port;
  const got: Buffer[] = [];
  upstream.on("message", (msg) => got.push(msg));
  let listenPort = 0;
  const forwarder = startTuyaLanForwarder({
    upstreamHost: "127.0.0.1",
    ports: [0],
    watch: false,
    upstreamPort: () => upstreamPort,
    onPortListening: (port) => {
      listenPort = port;
    },
  });
  const client = createSocket({ type: "udp4" });
  try {
    await forwarder.ready;
    assert.ok(listenPort > 0);
    client.send(Buffer.from("fwd"), listenPort, "127.0.0.1");
    await waitFor(() => got.some((buf) => buf.toString() === "fwd"), "上流に datagram が来ない");
  } finally {
    await closeSocket(client);
    await closeSocket(upstream);
    await forwarder.close();
  }
});

test("上流のアドレスが無いと受け役は起動しない", () => {
  const prev = process.env.YUI_TUYA_LAN_UPSTREAM;
  delete process.env.YUI_TUYA_LAN_UPSTREAM;
  try {
    assert.throws(() => startTuyaLanForwarder(), /YUI_TUYA_LAN_UPSTREAM/);
  } finally {
    if (prev !== undefined) process.env.YUI_TUYA_LAN_UPSTREAM = prev;
  }
});
