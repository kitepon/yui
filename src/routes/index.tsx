import { useHomeHydrated } from "@/lib/home/use-hydrated";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/lib/auth/gates";
import { DeviceCard } from "@/components/device-card";
import { DeviceSheet } from "@/components/device-sheet";
import { HomeClock } from "@/components/home-clock";
import { HScroll } from "@/components/h-scroll";
import { InstallHint } from "@/components/install-hint";
import { runCommand, runScene } from "@/lib/home/run";
import { sortByOrder, useHome } from "@/lib/home/store";
import type { Device } from "@/lib/home/types";
import { useTokyoClock } from "@/lib/home/period";
import { headerPhoto, headerPosition, headerTitle, roomPhoto } from "@/lib/home/photos";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/")({
  component: () => (
    <RequireAuth>
      <HomePage />
    </RequireAuth>
  ),
});

function HomePage() {
  const ready = useHomeHydrated();
  const rawDevices = useHome((s) => s.devices);
  const hasLive = rawDevices.some((d) => d.source === "live");
  const devices = hasLive ? rawDevices.filter((d) => d.source === "live") : rawDevices;
  const definedRooms = useHome((s) => s.rooms);
  const deviceOrder = useHome((s) => s.deviceOrder);
  const climate = useHome((s) => s.climate);
  const demoVisible = useHome((s) => s.demoVisible);
  const lastScene = useHome((s) => s.lastScene);
  const scenes = useHome((s) => s.scenes);
  const [room, setRoom] = useState("すべて");
  const [open, setOpen] = useState<Device | null>(null);

  const roomOrder = useMemo(() => {
    const extra = devices.map((d) => d.room).filter((r) => !definedRooms.includes(r));
    return [...definedRooms, ...Array.from(new Set(extra))];
  }, [definedRooms, devices]);

  const rooms = useMemo(() => {
    const present = new Set(devices.map((d) => d.room));
    return ["すべて", ...roomOrder.filter((r) => present.has(r))];
  }, [devices, roomOrder]);

  const visible = devices.filter((d) => room === "すべて" || d.room === room);

  const grouped = roomOrder
    .map((r) => ({
      room: r,
      items: sortByOrder(
        visible.filter((d) => d.room === r),
        deviceOrder[r],
      ),
    }))
    .filter((g) => g.items.length);

  const liveOpen = open ? (devices.find((d) => d.id === open.id) ?? open) : null;
  const clock = useTokyoClock();
  const still = headerPhoto(room, clock.period);
  const title = headerTitle(room);

  return (
    <AppShell>
      <header className="px-4 pt-3">
        <div className="relative h-56 overflow-hidden rounded-lg">
          <img
            src={still}
            alt={title}
            className={cn("h-full w-full object-cover", roomPhoto(room) ? "period-room" : undefined)}
            style={{ objectPosition: headerPosition(room) }}
          />
          <HomeClock />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-4 pb-3">
            <div>
              {room === "すべて" ? (
                <p className="text-[11px] tracking-[0.22em] text-faint">YUI</p>
              ) : null}
              <h1 className="font-display text-3xl font-medium text-fg">{title}</h1>
            </div>
            <p className="font-display text-2xl tabular-nums text-fg">
              {climate.temperature != null ? climate.temperature.toFixed(1) : "—"}
              <span className="ml-0.5 text-sm text-muted">°</span>
            </p>
          </div>
        </div>
        {!hasLive && demoVisible ? (
          <p className="mt-3 text-xs text-faint">デモ宅です。接続で実機に切り替わります。</p>
        ) : null}
        {ready && !hasLive && !demoVisible && devices.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            まだ機器がありません。下の接続から Remo / SwitchBot / Smart Life をつないでください。
          </p>
        ) : null}
        {room === "すべて" ? <InstallHint /> : null}
      </header>

      <section className="mt-5 px-4">
        <div className="grid grid-cols-2 gap-2.5">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => runScene(scene.id, scene.name)}
              className={cn(
                "flex min-h-16 items-center rounded-md border px-3.5 text-left",
                lastScene === scene.id
                  ? "border-primary/40 bg-surface"
                  : "border-border bg-bg-2",
              )}
            >
              <span className="text-[15px] font-medium text-fg">{scene.name}</span>
            </button>
          ))}
        </div>
      </section>

      <HScroll className="mt-5 flex gap-2 px-4">
        {rooms.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRoom(r)}
            className={cn(
              "h-11 shrink-0 rounded-full px-4 text-sm",
              room === r ? "bg-primary text-primary-fg" : "bg-surface text-muted",
            )}
          >
            {r}
          </button>
        ))}
        <Link
          to="/rooms"
          className="flex h-11 shrink-0 items-center rounded-full border border-border px-4 text-sm text-muted"
        >
          場所を編集
        </Link>
      </HScroll>

      <div className="mt-4 space-y-6 px-4">
        {!ready
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg bg-surface" />
            ))
          : grouped.map((g) => (
              <section key={g.room}>
                {room === "すべて" ? (
                  <h2 className="mb-3 text-xs tracking-wide text-faint">{g.room}</h2>
                ) : null}
                <div className="grid grid-cols-2 gap-2.5">
                  {g.items.map((device) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      onOpen={setOpen}
                      onToggle={(d) => runCommand(d, { on: !d.on })}
                    />
                  ))}
                </div>
              </section>
            ))}
      </div>

      <DeviceSheet
        device={liveOpen}
        onClose={() => setOpen(null)}
        onChange={(device, patch) => {
          setOpen({ ...device, ...patch });
          runCommand(device, patch);
        }}
      />
    </AppShell>
  );
}
