export const YUI_TZ = "Asia/Tokyo";

export const DAY_PERIODS = ["late", "dawn", "morning", "day", "evening", "night"] as const;
export type DayPeriod = (typeof DAY_PERIODS)[number];

export const PERIOD_LABEL: Record<DayPeriod, string> = {
  late: "深夜",
  dawn: "早朝",
  morning: "朝",
  day: "昼",
  evening: "夕方",
  night: "夜",
};

export function isLightPeriod(period: DayPeriod) {
  return period === "dawn" || period === "morning" || period === "day" || period === "evening";
}

export function nextPeriodPreview(from: DayPeriod, live: DayPeriod): DayPeriod | null {
  const next = DAY_PERIODS[(DAY_PERIODS.indexOf(from) + 1) % DAY_PERIODS.length];
  return next === live ? null : next;
}

/** 結の時刻帯。設定オートメーションと同じ Asia/Tokyo。 */
export function periodOfHour(hour: number): DayPeriod {
  if (hour < 5) return "late";
  if (hour < 7) return "dawn";
  if (hour < 11) return "morning";
  if (hour < 17) return "day";
  if (hour < 19) return "evening";
  return "night";
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type TokyoClock = {
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  dayKey: string;
  label: string;
  period: DayPeriod;
  periodLabel: string;
};

export function clockInTokyo(at = new Date()): TokyoClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: YUI_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const period = periodOfHour(hour);
  return {
    hour,
    minute,
    second,
    weekday: WEEKDAY[get("weekday")] ?? 0,
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    period,
    periodLabel: PERIOD_LABEL[period],
  };
}
