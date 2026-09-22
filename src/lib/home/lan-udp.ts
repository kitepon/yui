import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createConnection } from "node:net";
import { createSocket, type Socket } from "node:dgram";
import { chmodSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

/**
 * Smart Life の名乗りを受ける UDP。
 *
 * 起動時に bind したままにすると、ルーター再起動のあと通知が届かなくなる。
 * ホストの IPv4 かリンクが変わったとき、ソケットが死んだときに、閉じて開き直す。
 */

const WATCH_MS = 5000;
const RETRY_MS = 1000;

export type LanSnapshot = { ipv4: string[]; links: string[] };

/**
 * 家の LAN だけを見る。docker の橋や veth は容器の増減で毎回変わるので、
 * ルーター再起動の対象に数えない。
 */
export function isLanWatchInterface(name: string): boolean {
  if (!name || name === "lo") return false;
  if (/^(docker|veth|cni|flannel|cali|virbr)/.test(name)) return false;
  if (/^br-[0-9a-f]{12}$/i.test(name)) return false;
  return true;
}

export function assembleLanSnapshot(
  interfaces: Partial<Record<string, NetworkInterfaceInfo[] | undefined>>,
  links: readonly string[],
): LanSnapshot {
  const ipv4: string[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!isLanWatchInterface(name)) continue;
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) ipv4.push(`${name}=${addr.address}`);
    }
  }
  ipv4.sort();
  return { ipv4, links: links.filter((row) => isLanWatchInterface(row.split("=")[0] ?? "")).sort() };
}

export function lanSnapshotChanged(prev: LanSnapshot, next: LanSnapshot): boolean {
  return prev.ipv4.join("\n") !== next.ipv4.join("\n") || prev.links.join("\n") !== next.links.join("\n");
}

/** Linux の carrier。lo は除く。sysfs が無い OS では空。 */
export function readCarrierLinks(sysfsRoot = "/sys/class/net"): string[] {
  let names: string[];
  try {
    names = readdirSync(sysfsRoot);
  } catch {
    return [];
  }
  const links: string[] = [];
  for (const name of names) {
    if (!isLanWatchInterface(name)) continue;
    try {
      const carrier = readFileSync(`${sysfsRoot}/${name}/carrier`, "utf8").trim();
      if (carrier) links.push(`${name}=${carrier}`);
    } catch {
      /* carrier を持たないインターフェースは対象にしない。 */
    }
  }
  links.sort();
  return links;
}

export function readLanSnapshot(): LanSnapshot {
  return assembleLanSnapshot(networkInterfaces(), readCarrierLinks());
}

function snapshotReason(prev: LanSnapshot, next: LanSnapshot): string {
  const address = prev.ipv4.join("\n") !== next.ipv4.join("\n");
  const link = prev.links.join("\n") !== next.links.join("\n");
  if (address && link) return "address+link";
  if (address) return "address";
  return "link";
}

function closeQuiet(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      socket.close(finish);
    } catch {
      finish();
    }
  });
}

export type ListenLanUdp = {
  ready: Promise<void>;
  rebind: () => Promise<void>;
  close: () => Promise<void>;
};

/**
 * `ports` を bind する。`watch` のとき、スナップショットが変われば開き直す。
 * ソケットのエラーでも、1 秒後に開き直す。
 */
export function listenLanUdp(options: {
  ports: readonly number[];
  onMessage: (msg: Buffer, port: number) => void;
  onPortError?: (port: number, err: NodeJS.ErrnoException) => void;
  onPortListening?: (port: number) => void;
  onReset?: () => void;
  watch?: boolean;
}): ListenLanUdp {
  const { ports, onMessage, onPortError, onPortListening, onReset, watch = true } = options;
  let sockets: Socket[] = [];
  let closed = false;
  let generation = 0;
  let chain = Promise.resolve();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const logged = new Map<number, string>();
  let prev = readLanSnapshot();

  function logError(port: number, err: NodeJS.ErrnoException) {
    if (logged.get(port) === err.message) return;
    logged.set(port, err.message);
    console.error("[yui] smartlife lan listen", port, err.message);
  }

  function scheduleRetry() {
    if (closed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (!closed) void enqueueRebind();
    }, RETRY_MS);
  }

  function enqueueRebind(): Promise<void> {
    chain = chain.then(() => (closed ? undefined : bindAll())).then(
      () => undefined,
      (err: unknown) => {
        console.error("[yui] smartlife lan listen", err instanceof Error ? err.message : err);
        scheduleRetry();
      },
    );
    return chain;
  }

  function bindOne(gen: number, port: number): Promise<Socket | undefined> {
    return new Promise((resolve) => {
      if (closed || gen !== generation) {
        resolve(undefined);
        return;
      }
      const socket = createSocket({ type: "udp4", reuseAddr: true });
      let boundPort = port;
      let done = false;
      const finish = (value: Socket | undefined) => {
        if (done) return;
        done = true;
        resolve(value);
      };
      socket.on("message", (msg) => {
        try {
          onMessage(msg, boundPort);
        } catch (err) {
          console.error("[yui] smartlife lan listen", boundPort, err instanceof Error ? err.message : err);
        }
      });
      socket.on("error", (err: NodeJS.ErrnoException) => {
        if (gen === generation && !closed) {
          logError(port, err);
          onPortError?.(port, err);
          scheduleRetry();
        }
        finish(socket);
      });
      socket.bind(port, () => {
        if (done || closed || gen !== generation) {
          void closeQuiet(socket).then(() => finish(undefined));
          return;
        }
        const addr = socket.address();
        if (typeof addr !== "string") boundPort = addr.port;
        logged.delete(port);
        onPortListening?.(boundPort);
        finish(socket);
      });
    });
  }

  async function bindAll() {
    const gen = ++generation;
    const previous = sockets;
    sockets = [];
    onReset?.();
    await Promise.all(previous.map(closeQuiet));
    if (closed || gen !== generation) return;
    const opened = await Promise.all(ports.map((port) => bindOne(gen, port)));
    if (closed || gen !== generation) {
      await Promise.all(opened.map((socket) => (socket ? closeQuiet(socket) : undefined)));
      return;
    }
    const next: Socket[] = [];
    for (const socket of opened) {
      if (socket) next.push(socket);
    }
    sockets = next;
  }

  const watchTimer = watch
    ? setInterval(() => {
        const next = readLanSnapshot();
        if (!lanSnapshotChanged(prev, next)) {
          prev = next;
          return;
        }
        console.error("[yui] smartlife lan listen rebind", snapshotReason(prev, next));
        prev = next;
        void enqueueRebind();
      }, WATCH_MS)
    : undefined;

  const ready = enqueueRebind();

  return {
    ready,
    rebind: enqueueRebind,
    async close() {
      closed = true;
      generation += 1;
      if (watchTimer) clearInterval(watchTimer);
      if (retryTimer) clearTimeout(retryTimer);
      const previous = sockets;
      sockets = [];
      await Promise.all(previous.map(closeQuiet));
    },
  };
}

/** 受けた datagram を、別ネットワークの同じポート番号へ渡す。 */
export type ListenLanForwarder = ListenLanUdp & { relayUrl?: string };

export function startTuyaLanForwarder(options?: {
  upstreamHost?: string;
  ports?: readonly number[];
  upstreamPort?: (listenPort: number) => number;
  watch?: boolean;
  onPortListening?: (port: number) => void;
  relayBind?: string;
}): ListenLanForwarder {
  const upstreamHost = options?.upstreamHost ?? process.env.YUI_TUYA_LAN_UPSTREAM?.trim();
  if (!upstreamHost) throw new Error("YUI_TUYA_LAN_UPSTREAM が無い");
  const ports = options?.ports ?? [6666, 6667];
  const upstreamPort = options?.upstreamPort ?? ((port: number) => port);
  const sender = createSocket({ type: "udp4" });
  sender.on("error", (err) => {
    console.error("[yui] smartlife lan forward", err.message);
  });
  const listen = listenLanUdp({
    ports,
    watch: options?.watch,
    onPortListening: options?.onPortListening,
    onMessage(msg, port) {
      sender.send(msg, upstreamPort(port), upstreamHost);
    },
  });
  const relay = startTuyaLanRelay(options?.relayBind ?? process.env.YUI_TUYA_LAN_RELAY_BIND?.trim());
  return {
    ready: Promise.all([listen.ready, relay?.ready ?? Promise.resolve()]).then(() => undefined),
    rebind: listen.rebind,
    relayUrl: relay?.url,
    async close() {
      await listen.close();
      await relay?.close();
      await closeQuiet(sender);
    },
  };
}

const RELAY_TIMEOUT_MS = 5000;

/** 55aa フレームの長さ欄だけ見て、1 フレーム分揃ったか見る。CRC は呼ぶ側が判定する。 */
export function tuyaFrameTotal(buf: Buffer): number | undefined {
  if (buf.length < 16) return undefined;
  return 16 + buf.readUInt32BE(12);
}

function readRequestJson(req: IncomingMessage): Promise<{ host: string; port: number; frame: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const json = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { host?: unknown; port?: unknown; frame?: unknown };
        if (typeof json.host !== "string" || !json.host) throw new Error("host");
        if (typeof json.port !== "number" || !Number.isInteger(json.port) || json.port < 1 || json.port > 65535) {
          throw new Error("port");
        }
        if (typeof json.frame !== "string" || !json.frame) throw new Error("frame");
        resolve({ host: json.host, port: json.port, frame: json.frame });
      } catch {
        reject(new Error("Smart Life 直結: 受け役の要求が読めません"));
      }
    });
    req.on("error", reject);
  });
}

function exchangeOnce(host: string, port: number, frame: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      socket.destroy();
      fn();
    };
    const socket = createConnection({ host, port }, () => {
      socket.write(frame);
    });
    socket.setTimeout(RELAY_TIMEOUT_MS);
    socket.on("timeout", () => finish(() => reject(new Error(`Smart Life 直結: ${host} が ${RELAY_TIMEOUT_MS / 1000} 秒以内に応答しません`))));
    socket.on("error", (err) => finish(() => reject(new Error(`Smart Life 直結: ${host} へ届きません（${err.message}）`))));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const total = tuyaFrameTotal(buf);
      if (total != null && buf.length >= total) finish(() => resolve(buf.subarray(0, total)));
    });
    socket.on("close", () => finish(() => reject(new Error(`Smart Life 直結: ${host} が応答前に切断しました`))));
  });
}

export type ListenLanRelay = { ready: Promise<void>; url: string; close: () => Promise<void> };

function isUnixBind(bind: string): boolean {
  return bind.startsWith("/") || bind.startsWith("unix:");
}

function unixPath(bind: string): string {
  return bind.startsWith("unix:") ? bind.slice("unix:".length) : bind;
}

/** 容器から届かない LAN の TCP を、ホストの口で中継する。 */
export function startTuyaLanRelay(bind?: string): ListenLanRelay | undefined {
  const raw = bind?.trim();
  if (!raw) return undefined;
  const unix = isUnixBind(raw) ? unixPath(raw) : undefined;
  let listenHost: string | undefined;
  let listenPort = 0;
  if (!unix) {
    const sep = raw.lastIndexOf(":");
    listenHost = raw.slice(0, sep);
    listenPort = Number(raw.slice(sep + 1));
    if (!listenHost || !Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
      throw new Error(`Smart Life 直結: 受け役の待ち受けが読めません（${raw}）`);
    }
  }
  let server: Server | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    server = createServer((req, res) => {
      void handleRelayRequest(req, res);
    });
    server.on("error", reject);
    const onListening = () => {
      server?.off("error", reject);
      server?.on("error", (err) => {
        console.error("[yui] smartlife lan relay", err.message);
      });
      if (unix) {
        chmodSync(unix, 0o666);
        console.error("[yui] smartlife lan relay", unix);
      } else {
        const addr = server?.address();
        const port = addr && typeof addr !== "string" ? addr.port : listenPort;
        console.error("[yui] smartlife lan relay", `http://${listenHost}:${port}`);
      }
      resolve();
    };
    if (unix) {
      try {
        unlinkSync(unix);
      } catch {
        /* 初回はソケットが無い。 */
      }
      server.listen(unix, onListening);
    } else {
      server.listen(listenPort, listenHost, onListening);
    }
  });
  return {
    ready,
    get url() {
      if (unix) return unix;
      const addr = server?.address();
      if (!addr || typeof addr === "string") return `http://${listenHost}:${listenPort}`;
      return `http://${addr.address}:${addr.port}`;
    },
    close() {
      const current = server;
      server = undefined;
      if (!current) return Promise.resolve();
      return new Promise((resolve) => {
        current.close(() => {
          if (unix) {
            try {
              unlinkSync(unix);
            } catch {
              /* 閉じたあと消えないこともある。 */
            }
          }
          resolve();
        });
      });
    },
  };
}

async function handleRelayRequest(req: IncomingMessage, res: ServerResponse) {
  const write = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST" || req.url !== "/exchange") {
    write(404, { error: "Smart Life 直結: 受け役にその口はありません" });
    return;
  }
  try {
    const body = await readRequestJson(req);
    const frame = await exchangeOnce(body.host, body.port, Buffer.from(body.frame, "base64"));
    write(200, { frame: frame.toString("base64") });
  } catch (err) {
    write(502, { error: err instanceof Error ? err.message : String(err) });
  }
}

function postExchange(options: { url?: string; socketPath?: string }, body: string): Promise<{ status: number; json: { frame?: string; error?: string } }> {
  return new Promise((resolve, reject) => {
    const url = options.url ? new URL("/exchange", options.url) : undefined;
    const req = httpRequest(
      options.socketPath
        ? { socketPath: options.socketPath, path: "/exchange", method: "POST", headers: { "content-type": "application/json" } }
        : { hostname: url!.hostname, port: url!.port, path: url!.pathname, method: "POST", headers: { "content-type": "application/json" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) as { frame?: string; error?: string } });
          } catch {
            reject(new Error("Smart Life 直結: 受け役の応答が JSON ではありません"));
          }
        });
      },
    );
    req.setTimeout(RELAY_TIMEOUT_MS + 1000, () => {
      req.destroy();
      reject(new Error("Smart Life 直結: 受け役へ届きません（timeout）"));
    });
    req.on("error", (err) => reject(new Error(`Smart Life 直結: 受け役へ届きません（${err.message}）`)));
    req.end(body);
  });
}

/** 容器側。受け役へ 1 フレーム渡し、機器の応答フレームを返す。 */
export async function relayLanTcp(relayUrl: string, host: string, port: number, frame: Buffer): Promise<Buffer> {
  const body = JSON.stringify({ host, port, frame: frame.toString("base64") });
  let res: { status: number; json: { frame?: string; error?: string } };
  try {
    res = isUnixBind(relayUrl)
      ? await postExchange({ socketPath: unixPath(relayUrl) }, body)
      : await postExchange({ url: relayUrl }, body);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : `Smart Life 直結: 受け役へ届きません（${err}）`);
  }
  if (res.status !== 200 || !res.json.frame) {
    throw new Error(res.json.error || `Smart Life 直結: 受け役が HTTP ${res.status}`);
  }
  return Buffer.from(res.json.frame, "base64");
}
