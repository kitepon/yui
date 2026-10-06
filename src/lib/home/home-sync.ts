import type { HomeSnapshot } from "./snapshot.ts";

type ServerHome = HomeSnapshot & { host?: string };

export interface HomeSyncDeps {
  pull: () => Promise<ServerHome>;
  push: (state: HomeSnapshot) => Promise<ServerHome>;
  /** 画面がいま持っている家。 */
  local: () => HomeSnapshot;
  apply: (snap: ServerHome, host: string) => void;
  /** 画面の家が変わるたびに呼ばれる。戻り値で解除する。 */
  subscribe: (listener: () => void) => () => void;
  setPin: (pin: string) => void;
  host: () => string;
  refreshMs: number;
}

const PUSH_DELAY_MS = 800;

function hasCredential(credentials: HomeSnapshot["credentials"]) {
  return Object.values(credentials).some((v) => typeof v === "string" && v.trim());
}

/**
 * 画面とサーバーの家を合わせ続ける。戻り値で止める。
 *
 * 画面の変更は少し待ってまとめて送る。送り終えるまでは、サーバーから読んだ家で
 * 画面を上書きしない。読取の周期が待ち時間より短いので、上書きすると
 * 保存したばかりの変更が送る前に消える。
 */
export function startHomeSync(deps: HomeSyncDeps) {
  let ignore = false;
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let pushing = false;
  let applying = false;
  let pulling = false;
  let revision = 0;
  // 画面の変更が、まだサーバーへ届いていない。
  let dirty = false;

  const pull = async () => {
    if (pulling || dirty) return;
    pulling = true;
    const startedRevision = revision;
    try {
      const snap = await deps.pull();
      if (ignore || dirty || revision !== startedRevision) return;
      if (snap.pairPin) deps.setPin(snap.pairPin);
      const local = deps.local();
      const serverHasLife =
        Boolean(snap.savedAt) ||
        hasCredential(snap.credentials) ||
        snap.automations.length > 0 ||
        snap.devices.some((d) => d.source === "live");
      const localHasLife = hasCredential(local.credentials) || local.automations.length > 0;
      applying = true;
      if (serverHasLife) {
        deps.apply(snap, snap.host ?? deps.host());
      } else if (localHasLife) {
        applying = false;
        const saved = await deps.push(local);
        if (ignore) return;
        applying = true;
        deps.apply(saved, deps.host());
      } else {
        deps.apply(snap, snap.host ?? deps.host());
      }
      applying = false;
    } catch {
      applying = false;
    } finally {
      pulling = false;
    }
  };

  const schedulePush = () => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushing = true;
      const sent = revision;
      void deps
        .push(deps.local())
        .catch(() => undefined)
        .finally(() => {
          pushing = false;
          if (ignore) return;
          // 送っている間にまた変わっていたら、その分も送る。
          if (revision !== sent) schedulePush();
          else dirty = false;
        });
    }, PUSH_DELAY_MS);
  };

  void pull();
  const poll = setInterval(() => void pull(), deps.refreshMs);

  const unsub = deps.subscribe(() => {
    if (applying) return;
    revision++;
    dirty = true;
    if (!pushing) schedulePush();
  });

  return () => {
    ignore = true;
    clearInterval(poll);
    clearTimeout(pushTimer);
    unsub();
  };
}
