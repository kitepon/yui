import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  clockInTokyo,
  nextPeriodPreview,
  PERIOD_LABEL,
  type DayPeriod,
  type TokyoClock,
} from "./clock";

export type PeriodView = TokyoClock & {
  previewing: boolean;
  cyclePreview: () => void;
};

const PeriodContext = createContext<PeriodView>({
  ...clockInTokyo(),
  previewing: false,
  cyclePreview: () => undefined,
});

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [clock, setClock] = useState(() => clockInTokyo());
  const [preview, setPreview] = useState<DayPeriod | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setClock(clockInTokyo()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const period = preview ?? clock.period;
  const view = useMemo<PeriodView>(
    () => ({
      ...clock,
      period,
      periodLabel: PERIOD_LABEL[period],
      previewing: preview !== null,
      cyclePreview: () =>
        setPreview((cur) => {
          const live = clockInTokyo().period;
          return nextPeriodPreview(cur ?? live, live);
        }),
    }),
    [clock, period, preview],
  );
  useEffect(() => {
    document.documentElement.dataset.period = period;
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim();
    if (meta && bg) meta.setAttribute("content", bg);
  }, [period]);
  return <PeriodContext.Provider value={view}>{children}</PeriodContext.Provider>;
}

export function useTokyoClock() {
  return useContext(PeriodContext);
}
