import { useEffect } from "react";
import { pullHome, pushHome, setControlPin } from "@/lib/home/control-client";
import { snapshotFromState, useHome } from "@/lib/home/store";
import { useHomeHydrated } from "@/lib/home/use-hydrated";

export function PersistHydrator() {
  const ready = useHomeHydrated();

  useEffect(() => {
    if (!ready) return;
    let ignore = false;
    let pushTimer: number | undefined;
    let pushing = false;
    let applying = false;

    const pull = async () => {
      try {
        const snap = await pullHome();
        if (ignore) return;
        if (snap.pairPin) setControlPin(snap.pairPin);
        const local = useHome.getState();
        const serverHasLife =
          Boolean(snap.savedAt) ||
          Object.values(snap.credentials).some((v) => v.trim()) ||
          snap.automations.length > 0 ||
          snap.devices.some((d) => d.source === "live");
        const localHasLife =
          Object.values(local.credentials).some((v) => v.trim()) || local.automations.length > 0;
        applying = true;
        if (serverHasLife) {
          useHome.getState().applySnapshot(snap, snap.host ?? window.location.host);
        } else if (localHasLife) {
          applying = false;
          const saved = await pushHome(snapshotFromState(local));
          if (ignore) return;
          applying = true;
          useHome.getState().applySnapshot(saved, window.location.host);
        } else {
          useHome.getState().applySnapshot(snap, snap.host ?? window.location.host);
        }
        applying = false;
      } catch {
        applying = false;
      }
    };

    void pull();
    const poll = window.setInterval(() => void pull(), 20000);

    const unsub = useHome.subscribe(() => {
      if (pushing || applying) return;
      window.clearTimeout(pushTimer);
      pushTimer = window.setTimeout(() => {
        pushing = true;
        const snap = snapshotFromState(useHome.getState());
        void pushHome(snap)
          .catch(() => undefined)
          .finally(() => {
            pushing = false;
          });
      }, 800);
    });

    return () => {
      ignore = true;
      window.clearInterval(poll);
      window.clearTimeout(pushTimer);
      unsub();
    };
  }, [ready]);

  return null;
}
