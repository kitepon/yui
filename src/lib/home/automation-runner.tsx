import { useEffect } from "react";
import { fireSensorAutomations, fireTimeAutomations } from "./run-automation";

export function AutomationRunner() {
  useEffect(() => {
    const tick = () => {
      fireTimeAutomations();
      fireSensorAutomations();
    };
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
