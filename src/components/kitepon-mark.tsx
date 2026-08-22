import { isLightPeriod } from "@/lib/home/clock";
import { useTokyoClock } from "@/lib/home/period";

export function KiteponMark() {
  const { period } = useTokyoClock();
  const light = isLightPeriod(period);
  return (
    <a href="https://kitepon.dev" className="flex justify-center py-1.5" aria-label="kitepon.dev">
      <img
        src={light ? "/brand/kitepon-dev-primary.png" : "/brand/kitepon-dev-on-night.png"}
        alt="kitepon.dev"
        width={120}
        height={36}
        className="h-6 w-auto"
      />
    </a>
  );
}
