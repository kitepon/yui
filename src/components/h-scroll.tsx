import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** 横に送れる列。バーは出さない。指はネイティブ、マウスはドラッグ。 */
export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pid: number | null = null;
    let x0 = 0;
    let left0 = 0;
    let dragged = false;

    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pid = e.pointerId;
      x0 = e.clientX;
      left0 = el.scrollLeft;
      dragged = false;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) < 6) return;
      dragged = true;
      el.scrollLeft = left0 - dx;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = null;
      if (dragged) window.setTimeout(() => { dragged = false; }, 50);
    };
    const click = (e: Event) => {
      if (!dragged) return;
      e.preventDefault();
      e.stopPropagation();
      dragged = false;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
    };
  }, []);

  return (
    <div ref={ref} className={cn("scroll-x", className)}>
      {children}
    </div>
  );
}
