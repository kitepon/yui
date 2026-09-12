import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as Slider from "@radix-ui/react-slider";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/lib/auth/gates";
import { pullAnalysis } from "@/lib/home/control-client";
import { ON_METRIC } from "@/lib/home/analysis-series";
import {
  HOUR_MS,
  MINUTE_MS,
  clampWindow,
  collectValues,
  minSpanSteps,
  paddedDomain,
  yScale,
} from "@/lib/home/analysis-view";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/analysis")({
  component: () => (
    <RequireAuth>
      <AnalysisPage />
    </RequireAuth>
  ),
});

type RangeKey = "24h" | "7d" | "14d";
type AnalysisData = Awaited<ReturnType<typeof pullAnalysis>>;

const STORE_KEY = "yui-analysis-select";
const COLORS = ["#c45a28", "#3a5068", "#3d5c38", "#8b2018", "#6a4838", "#d88818", "#3d6a68"];
const PREFERRED = ["室温", "外気温", "湿度", "水温"];
const OUTCOME_LABEL: Record<string, string> = {
  sent: "送った",
  failed: "送れなかった",
  skipped: "動かさなかった",
  left: "条件を外れた",
};
const REASON_LABEL: Record<string, string> = {
  skip_continuous: "連続では動かさない",
  claimed_by: "上のオートメーションが機器を取った",
  already_applied: "いまの設定と同じ",
  unreadable: "設定を読み返せない",
};

function windowOf(range: RangeKey) {
  const now = Date.now();
  const ms = range === "24h" ? 86_400_000 : range === "7d" ? 7 * 86_400_000 : 14 * 86_400_000;
  return { from: new Date(now - ms).toISOString(), to: new Date(now).toISOString() };
}

function matchesPreferred(label: string, key: string) {
  return label === key || label.endsWith(` ${key}`);
}

function defaultSeriesIds(series: AnalysisData["series"]) {
  const prefer = PREFERRED.flatMap((label) =>
    series.filter((s) => s.unit !== "on" && matchesPreferred(s.label, label)).map((s) => s.id),
  );
  if (prefer.length) return [...new Set(prefer)];
  return series.filter((s) => s.unit !== "on").slice(0, 4).map((s) => s.id);
}

function loadStore(): { range: RangeKey; series: string[]; automations: string[]; devices: string[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { range?: RangeKey; series?: string[]; automations?: string[]; devices?: string[] };
    const range = parsed.range === "7d" || parsed.range === "14d" ? parsed.range : "24h";
    return {
      range,
      series: parsed.series ?? [],
      automations: parsed.automations ?? [],
      devices: parsed.devices ?? [],
    };
  } catch {
    return null;
  }
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 cursor-pointer rounded-full border px-3 text-sm",
        active ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-fg",
      )}
    >
      {children}
    </button>
  );
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-2">{children}</div>;
}

function paramOrder(series: AnalysisData["series"]) {
  return [...series].sort((a, b) => {
    const ra = PREFERRED.findIndex((k) => matchesPreferred(a.label, k));
    const rb = PREFERRED.findIndex((k) => matchesPreferred(b.label, k));
    const na = ra < 0 ? PREFERRED.length : ra;
    const nb = rb < 0 ? PREFERRED.length : rb;
    if (na !== nb) return na - nb;
    return a.label.localeCompare(b.label, "ja");
  });
}

function formatTick(t: number, spanMs: number) {
  return new Date(t).toLocaleString(
    "ja-JP",
    spanMs <= 6 * HOUR_MS
      ? { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }
      : spanMs <= 48 * HOUR_MS
        ? { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit" }
        : { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" },
  );
}

function formatTimeCaption(from: number, to: number) {
  const a = new Date(from);
  const b = new Date(to);
  const dayOpt = { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" } as const;
  const sameDay = a.toLocaleDateString("ja-JP", dayOpt) === b.toLocaleDateString("ja-JP", dayOpt);
  const opt = sameDay
    ? ({ timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" } as const)
    : ({ timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" } as const);
  return `${a.toLocaleString("ja-JP", opt)} – ${b.toLocaleString("ja-JP", opt)}`;
}

function formatYCaption(lo: number, hi: number, digits: number) {
  return `${lo.toFixed(digits)} – ${hi.toFixed(digits)}`;
}

function DualRange({
  label,
  caption,
  min,
  max,
  start,
  end,
  step,
  minSpan,
  onChange,
}: {
  label: string;
  caption: string;
  min: number;
  max: number;
  start: number;
  end: number;
  step: number;
  minSpan: number;
  onChange: (start: number, end: number) => void;
}) {
  if (!(max > min)) return null;
  const [a, b] = clampWindow(min, max, start, end, minSpan);
  return (
    <div className="mt-3 px-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] tracking-wide text-faint">{label}</p>
        <p className="text-xs text-muted tabular-nums">{caption}</p>
      </div>
      <Slider.Root
        className="relative mt-1 flex h-11 w-full touch-none items-center"
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={minSpanSteps(max - min, step, minSpan)}
        value={[a, b]}
        onValueChange={(next) => {
          const lo = next[0];
          const hi = next[1];
          if (lo == null || hi == null) return;
          onChange(...clampWindow(min, max, lo, hi, minSpan));
        }}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-border">
          <Slider.Range className="absolute h-full rounded-full bg-primary" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-6 rounded-full border-2 border-primary bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          aria-label={`${label} 下限`}
        />
        <Slider.Thumb
          className="block size-6 rounded-full border-2 border-primary bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          aria-label={`${label} 上限`}
        />
      </Slider.Root>
    </div>
  );
}

function reasonText(reason: string | null, detail: string | null) {
  if (reason === "claimed_by") {
    try {
      const body = detail ? (JSON.parse(detail) as { name?: string }) : {};
      if (body.name) return `${body.name} が機器を取った`;
    } catch {
      /* keep default */
    }
  }
  if (reason && REASON_LABEL[reason]) return REASON_LABEL[reason];
  return reason ?? "";
}

function eventTime(ts: string) {
  return new Date(ts).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AnalysisPage() {
  const stored = useMemo(() => loadStore(), []);
  const [range, setRange] = useState<RangeKey>(stored?.range ?? "24h");
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seriesIds, setSeriesIds] = useState<string[] | null>(stored?.series ?? null);
  const [autoIds, setAutoIds] = useState<string[]>(stored?.automations ?? []);
  const [deviceIds, setDeviceIds] = useState<string[]>(stored?.devices ?? []);
  const [xView, setXView] = useState<[number, number] | null>(null);
  const [yLeft, setYLeft] = useState<[number, number] | null>(null);
  const [yRight, setYRight] = useState<[number, number] | null>(null);

  useEffect(() => {
    let gone = false;
    const { from, to } = windowOf(range);
    setError(null);
    void pullAnalysis(from, to)
      .then((next) => {
        if (gone) return;
        setData(next);
        setXView(null);
        setYLeft(null);
        setYRight(null);
        setSeriesIds((cur) => {
          const available = new Set(next.series.filter((s) => s.unit !== "on").map((s) => s.id));
          const kept = (cur ?? []).filter((id) => available.has(id));
          if (kept.length) return kept;
          return defaultSeriesIds(next.series);
        });
      })
      .catch((err: unknown) => {
        if (gone) return;
        setError(err instanceof Error ? err.message : "読み取れませんでした");
      });
    return () => {
      gone = true;
    };
  }, [range]);

  useEffect(() => {
    if (typeof window === "undefined" || seriesIds == null) return;
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ range, series: seriesIds, automations: autoIds, devices: deviceIds }),
    );
  }, [range, seriesIds, autoIds, deviceIds]);

  const paramSeries = paramOrder((data?.series ?? []).filter((s) => s.unit !== "on"));
  const onSeries = (data?.series ?? []).filter((s) => s.metric === ON_METRIC);
  const selectedParams = paramSeries.filter((s) => seriesIds?.includes(s.id));
  const selectedOn = onSeries.filter((s) => deviceIds.includes(s.deviceId));
  const fromMs = data ? Date.parse(data.from) : 0;
  const toMs = data ? Date.parse(data.to) : 0;

  const chartRows = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const series of [...selectedParams, ...selectedOn]) {
      for (const point of series.points) {
        const t = Date.parse(point.ts);
        if (Number.isNaN(t)) continue;
        const row = map.get(t) ?? { t };
        row[series.id] = point.value;
        map.set(t, row);
      }
    }
    return [...map.values()].sort((a, b) => a.t - b.t);
  }, [selectedParams, selectedOn]);

  const leftSeries = selectedParams.filter((s) => s.unit === "celsius");
  const rightSeries = selectedParams.filter((s) => s.unit === "percent" || s.unit === "lux");
  const leftValues = collectValues(chartRows, leftSeries.map((s) => s.id));
  const rightValues = collectValues(chartRows, rightSeries.map((s) => s.id));
  const leftExtent = paddedDomain(leftValues);
  const rightExtent = paddedDomain(rightValues);
  const xSpan: [number, number] = fromMs < toMs ? [fromMs, toMs] : [0, 1];
  const xDomain = xView ? clampWindow(xSpan[0], xSpan[1], xView[0], xView[1], HOUR_MS) : xSpan;
  const xSpanMs = xDomain[1] - xDomain[0];
  const leftScale = yScale("celsius");
  const rightUnits = [...new Set(rightSeries.map((s) => s.unit))];
  const rightScale =
    rightUnits.length === 1 && rightUnits[0] === "percent"
      ? yScale("percent")
      : rightUnits.length === 1 && rightUnits[0] === "lux"
        ? yScale("lux")
        : yScale("lux");
  const yLeftDomain = yLeft
    ? clampWindow(leftExtent[0], leftExtent[1], yLeft[0], yLeft[1], leftScale.minSpan)
    : leftExtent;
  const yRightDomain = yRight
    ? clampWindow(rightExtent[0], rightExtent[1], yRight[0], yRight[1], rightScale.minSpan)
    : rightExtent;
  const overlayEvents = (data?.events ?? []).filter((ev) => {
    if (!ev.automationId || !autoIds.includes(ev.automationId)) return false;
    if (ev.outcome !== "sent" && ev.outcome !== "failed") return false;
    const t = Date.parse(ev.ts);
    return t >= xDomain[0] && t <= xDomain[1];
  });

  return (
    <AppShell>
      <header className="px-4 pt-5">
        <p className="text-[11px] tracking-[0.22em] text-faint">ANALYSIS</p>
        <h1 className="mt-1 font-display text-3xl font-medium text-fg">分析</h1>
        <p className="mt-2 text-sm text-muted">センサーの変化と、動いた・動かさなかった記録です。</p>
      </header>

      <div className="mt-5 px-4">
        <div className="flex flex-wrap gap-2">
          {(["24h", "7d", "14d"] as const).map((key) => (
            <Chip key={key} active={range === key} onClick={() => setRange(key)}>
              {key === "24h" ? "24時間" : key === "7d" ? "7日" : "14日"}
            </Chip>
          ))}
        </div>
      </div>

      <section className="mt-6 px-4">
        <p className="text-[11px] tracking-wide text-faint">パラメータ</p>
        {paramSeries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">まだ数値がありません。</p>
        ) : (
          <ChipRow>
            {paramSeries.map((s) => (
              <Chip key={s.id} active={seriesIds?.includes(s.id) === true} onClick={() => setSeriesIds((cur) => toggleId(cur ?? [], s.id))}>
                {s.label}
              </Chip>
            ))}
          </ChipRow>
        )}
      </section>

      <section className="mt-5 px-4">
        <p className="text-[11px] tracking-wide text-faint">オートメーション</p>
        {(data?.automations ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">まだありません。</p>
        ) : (
          <ChipRow>
            {(data?.automations ?? []).map((auto) => (
              <Chip key={auto.id} active={autoIds.includes(auto.id)} onClick={() => setAutoIds((cur) => toggleId(cur, auto.id))}>
                {auto.name}
              </Chip>
            ))}
          </ChipRow>
        )}
      </section>

      <section className="mt-5 px-4">
        <p className="text-[11px] tracking-wide text-faint">機器の入切</p>
        {(data?.devices ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">まだありません。</p>
        ) : (
          <ChipRow>
            {(data?.devices ?? []).map((device) => (
              <Chip key={device.id} active={deviceIds.includes(device.id)} onClick={() => setDeviceIds((cur) => toggleId(cur, device.id))}>
                {device.name}
              </Chip>
            ))}
          </ChipRow>
        )}
      </section>

      <div className="mt-5 px-2">
        {error ? (
          <p className="px-2 text-sm text-danger">{error}</p>
        ) : chartRows.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-muted">
            まだ記録がありません。オートメーションが有効な家は、サーバーが1分ごとにセンサーを残します。
          </p>
        ) : (
          <div className="text-fg">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="currentColor" strokeOpacity={0.12} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={xDomain}
                    allowDataOverflow
                    tickFormatter={(t) => formatTick(Number(t), xSpanMs)}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                  />
                  {leftSeries.length ? (
                    <YAxis
                      yAxisId="left"
                      domain={leftValues.length ? yLeftDomain : undefined}
                      allowDataOverflow
                      tickFormatter={(v) => Number(v).toFixed(leftScale.digits)}
                      tick={{ fill: "currentColor", fontSize: 11 }}
                      width={42}
                    />
                  ) : null}
                  {selectedOn.length ? <YAxis yAxisId="on" domain={[0, 1]} hide /> : null}
                  {rightSeries.length ? (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={rightValues.length ? yRightDomain : undefined}
                      allowDataOverflow
                      tickFormatter={(v) => Number(v).toFixed(rightScale.digits)}
                      tick={{ fill: "currentColor", fontSize: 11 }}
                      width={42}
                    />
                  ) : null}
                  <Tooltip
                    labelFormatter={(t) => formatTick(Number(t), xSpanMs)}
                    contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                  />
                  {leftSeries.map((s, i) => (
                    <Line
                      key={s.id}
                      yAxisId="left"
                      type="monotone"
                      dataKey={s.id}
                      name={s.label}
                      stroke={COLORS[i % COLORS.length]}
                      dot={false}
                      connectNulls
                      strokeWidth={2}
                    />
                  ))}
                  {rightSeries.map((s, i) => (
                    <Line
                      key={s.id}
                      yAxisId="right"
                      type="monotone"
                      dataKey={s.id}
                      name={s.label}
                      stroke={COLORS[(i + 3) % COLORS.length]}
                      dot={false}
                      connectNulls
                      strokeWidth={2}
                      strokeDasharray={s.unit === "lux" ? "4 3" : undefined}
                    />
                  ))}
                  {selectedOn.map((s, i) => (
                    <Line
                      key={s.id}
                      yAxisId="on"
                      type="stepAfter"
                      dataKey={s.id}
                      name={s.label}
                      stroke={COLORS[(i + 5) % COLORS.length]}
                      dot={false}
                      connectNulls
                      strokeWidth={1.5}
                      strokeOpacity={0.7}
                    />
                  ))}
                  {overlayEvents.map((ev) => (
                    <ReferenceLine
                      key={ev.id}
                      yAxisId={leftSeries.length ? "left" : selectedOn.length ? "on" : "right"}
                      x={Date.parse(ev.ts)}
                      stroke={ev.outcome === "failed" ? "var(--color-danger)" : "var(--color-primary)"}
                      strokeDasharray={ev.outcome === "sent" ? undefined : "3 3"}
                      strokeOpacity={0.65}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <DualRange
              label="時間"
              caption={formatTimeCaption(xDomain[0], xDomain[1])}
              min={xSpan[0]}
              max={xSpan[1]}
              start={xDomain[0]}
              end={xDomain[1]}
              step={MINUTE_MS}
              minSpan={HOUR_MS}
              onChange={(start, end) => setXView([start, end])}
            />
            {leftValues.length ? (
              <DualRange
                label="温度"
                caption={`${formatYCaption(yLeftDomain[0], yLeftDomain[1], leftScale.digits)} ℃`}
                min={leftExtent[0]}
                max={leftExtent[1]}
                start={yLeftDomain[0]}
                end={yLeftDomain[1]}
                step={leftScale.step}
                minSpan={leftScale.minSpan}
                onChange={(start, end) => setYLeft([start, end])}
              />
            ) : null}
            {rightValues.length ? (
              <DualRange
                label={
                  rightUnits.length === 1 && rightUnits[0] === "percent"
                    ? "湿度"
                    : rightUnits.length === 1 && rightUnits[0] === "lux"
                      ? "照度"
                      : "湿度・照度"
                }
                caption={formatYCaption(yRightDomain[0], yRightDomain[1], rightScale.digits)}
                min={rightExtent[0]}
                max={rightExtent[1]}
                start={yRightDomain[0]}
                end={yRightDomain[1]}
                step={rightScale.step}
                minSpan={rightScale.minSpan}
                onChange={(start, end) => setYRight([start, end])}
              />
            ) : null}
          </div>
        )}
      </div>

      <section className="mt-8 px-4 pb-6">
        <p className="text-[11px] tracking-[0.22em] text-faint">LOG</p>
        <h2 className="mt-1 font-display text-2xl text-fg">記録</h2>
        <div className="mt-3 space-y-2">
          {(data?.events ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">この期間の操作はありません。</p>
          ) : (
            (data?.events ?? []).map((ev) => (
              <article key={ev.id} className="rounded-lg border border-border bg-surface px-3 py-2">
                <p className="text-xs text-faint">{eventTime(ev.ts)}</p>
                <p className="mt-0.5 text-sm text-fg">
                  {OUTCOME_LABEL[ev.outcome] ?? ev.outcome}
                  {ev.automationName ? ` · ${ev.automationName}` : ""}
                  {ev.deviceName ? ` · ${ev.deviceName}` : ""}
                </p>
                {ev.reason ? <p className="mt-0.5 text-xs text-muted">{reasonText(ev.reason, ev.detail)}</p> : null}
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
