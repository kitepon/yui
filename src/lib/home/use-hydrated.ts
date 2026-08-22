import { useEffect, useState } from "react";
import { useHome } from "./store";

let rehydrateStarted = false;

function startRehydrate() {
  if (typeof window === "undefined" || rehydrateStarted) return;
  rehydrateStarted = true;
  void useHome.persist.rehydrate();
}

export function useHomeHydrated() {
  const [ready, setReady] = useState(() =>
    typeof window === "undefined" ? false : useHome.persist.hasHydrated(),
  );

  useEffect(() => {
    if (useHome.persist.hasHydrated()) {
      setReady(true);
      return;
    }
    const unsub = useHome.persist.onFinishHydration(() => setReady(true));
    startRehydrate();
    return unsub;
  }, []);

  return ready;
}
