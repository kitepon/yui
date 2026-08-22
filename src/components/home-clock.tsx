import { useTokyoClock } from "@/lib/home/period";

export function HomeClock() {
  const clock = useTokyoClock();
  return (
    <button
      type="button"
      onClick={clock.cyclePreview}
      className="absolute right-3 top-3 min-h-11 rounded-md bg-bg/55 px-2 py-1 text-right backdrop-blur-sm"
      aria-label="時刻帯を試す"
    >
      <p className="font-display text-sm tabular-nums leading-none text-fg">{clock.label}</p>
      <p className="mt-0.5 text-[10px] tracking-wide text-faint">
        {clock.periodLabel}
        {clock.previewing ? " · 試し" : " · JST"}
      </p>
    </button>
  );
}
