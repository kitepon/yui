import { useEffect } from "react";
import { pullHome, pushHome, setControlPin } from "@/lib/home/control-client";
import { startHomeSync } from "@/lib/home/home-sync";
import { snapshotFromState, useHome } from "@/lib/home/store";
import { useHomeHydrated } from "@/lib/home/use-hydrated";
import { HOME_REFRESH_SECONDS } from "@/lib/home/control-tick";

export function PersistHydrator() {
  const ready = useHomeHydrated();

  useEffect(() => {
    if (!ready) return;
    return startHomeSync({
      pull: pullHome,
      push: pushHome,
      local: () => snapshotFromState(useHome.getState()),
      apply: (snap, host) => useHome.getState().applySnapshot(snap, host),
      subscribe: (listener) => useHome.subscribe(listener),
      setPin: setControlPin,
      host: () => window.location.host,
      refreshMs: HOME_REFRESH_SECONDS * 1000,
    });
  }, [ready]);

  return null;
}
