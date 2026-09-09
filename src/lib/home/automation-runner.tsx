import { useEffect } from "react";
import { fireScheduledAutomations } from "./run-automation";

export function AutomationRunner() {
  useEffect(() => {
    const tick = () => {
      fireScheduledAutomations();
    };
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
