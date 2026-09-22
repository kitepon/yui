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
  relayLanTcp,
  startTuyaLanForwarder,
  startTuyaLanRelay,
  tuyaFrameTotal,
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

test("docker の橋はスナップショットに入れない", () => {
  const root = mkdtempSync(join(tmpdir(), "yui-lan-"));
  try {
    mkdirSync(join(root, "eth0"));
    writeFileSync(join(root, "eth0", "carrier"), "1\n");
    mkdirSync(join(root, "docker0"));
    writeFileSync(join(root, "docker0", "carrier"), "1\n");
    mkdirSync(join(root, "br-02f90251c9cb"));
    writeFileSync(join(root, "br-02f90251c9cb", "carrier"), "1\n");
    const snap = assembleLanSnapshot(
      {
        eth0: [iface("192.168.1.2")],
        docker0: [iface("172.17.0.1")],
        "br-02f90251c9cb": [iface("172.16.240.1")],
      },
      readCarrierLinks(root),
    );
    assert.deepEqual(snap.ipv4, ["eth0=192.168.1.2"]);
    assert.deepEqual(snap.links, ["eth0=1"]);
    const flapped = assembleLanSnapshot(
      {
        eth0: [iface("192.168.1.2")],
        docker0: [iface("172.17.0.1")],
        "br-aaaaaaaaaaaa": [iface("172.18.0.1")],
      },
      ["eth0=1", "docker0=0"],
    );
    assert.equal(lanSnapshotChanged(snap, flapped), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

test("55aa フレームは長さ欄で 1 枚分を切る", () => {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(8, 12);
  assert.equal(tuyaFrameTotal(buf.subarray(0, 10)), undefined);
  assert.equal(tuyaFrameTotal(buf), 24);
});

test("受け役は容器の代わりに機器へ TCP して応答フレームを返す", async () => {
  const { createServer } = await import("node:net");
  const payload = Buffer.from("REPLYOK!!");
  const reply = Buffer.alloc(16 + payload.length);
  reply.writeUInt32BE(0x000055aa, 0);
  reply.writeUInt32BE(payload.length, 12);
  payload.copy(reply, 16);
  const device = createServer((socket) => {
    socket.on("data", () => socket.end(reply));
  });
  const devicePort = await new Promise<number>((resolve) => {
    device.listen(0, "127.0.0.1", () => resolve((device.address() as { port: number }).port));
  });
  const relay = startTuyaLanRelay("127.0.0.1:0");
  assert.ok(relay);
  try {
    await relay.ready;
    const got = await relayLanTcp(relay.url, "127.0.0.1", devicePort, Buffer.from("QUERY"));
    assert.deepEqual(got, reply);
  } finally {
    await relay.close();
    await new Promise<void>((resolve) => device.close(() => resolve()));
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
