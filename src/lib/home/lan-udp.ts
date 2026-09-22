import { createSocket, type Socket } from "node:dgram";
import { readdirSync, readFileSync } from "node:fs";
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

export function assembleLanSnapshot(
  interfaces: Partial<Record<string, NetworkInterfaceInfo[] | undefined>>,
  links: readonly string[],
): LanSnapshot {
  const ipv4: string[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) ipv4.push(`${name}=${addr.address}`);
    }
  }
  ipv4.sort();
  return { ipv4, links: [...links].sort() };
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
    if (name === "lo") continue;
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
export function startTuyaLanForwarder(options?: {
  upstreamHost?: string;
  ports?: readonly number[];
  upstreamPort?: (listenPort: number) => number;
  watch?: boolean;
  onPortListening?: (port: number) => void;
}): ListenLanUdp {
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
  return {
    ready: listen.ready,
    rebind: listen.rebind,
    async close() {
      await listen.close();
      await closeQuiet(sender);
    },
  };
}
