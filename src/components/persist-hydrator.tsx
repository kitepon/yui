import { useEffect } from "react";
import { pullHome, pushHome, setControlPin } from "@/lib/home/control-client";
import { snapshotFromState, useHome } from "@/lib/home/store";
import { useHomeHydrated } from "@/lib/home/use-hydrated";
import { HOME_REFRESH_SECONDS } from "@/lib/home/control-tick";

export function PersistHydrator() {
  const ready = useHomeHydrated();

  useEffect(() => {
    if (!ready) return;
    let ignore = false;
    let pushTimer: number | undefined;
    let pushing = false;
    let applying = false;
    let pulling = false;
    let revision = 0;

    const pull = async () => {
      if (pulling) return;
      pulling = true;
      const startedRevision = revision;
      try {
        const snap = await pullHome();
        if (ignore || revision !== startedRevision) return;
        if (snap.pairPin) setControlPin(snap.pairPin);
        const local = useHome.getState();
        const serverHasLife =
          Boolean(snap.savedAt) ||
          Object.values(snap.credentials).some((v) => typeof v === "string" && v.trim()) ||
          snap.automations.length > 0 ||
          snap.devices.some((d) => d.source === "live");
        const localHasLife =
          Object.values(local.credentials).some((v) => typeof v === "string" && v.trim()) || local.automations.length > 0;
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
      } finally {
        pulling = false;
      }
    };

    void pull();
    const poll = window.setInterval(() => void pull(), HOME_REFRESH_SECONDS * 1000);

    const unsub = useHome.subscribe(() => {
      if (applying) return;
      revision++;
      if (pushing) return;
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
