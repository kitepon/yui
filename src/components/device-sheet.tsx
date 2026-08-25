import { useState } from "react";
import { X } from "lucide-react";
import { KIND_LABEL, sourceLabel, type Device } from "@/lib/home/types";
import { useHome } from "@/lib/home/store";
import { DeviceControls } from "./device-controls";
import { Button } from "./ui/button";

export function DeviceSheet({
  device,
  onClose,
  onChange,
}: {
  device: Device | null;
  onClose: () => void;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  const rooms = useHome((s) => s.rooms);
  const updateDeviceMeta = useHome((s) => s.updateDeviceMeta);
  // 名前を変えても Alexa の呼び名はすぐには変わらない。
  // 能動通知を持たないので、Alexa 側の再検出が要ることをその場で伝える。
  const [renamed, setRenamed] = useState(false);
  if (!device) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/70 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label="閉じる" onClick={onClose} />
      <div
        role="dialog"
        aria-label={device.name}
        className="relative w-full max-w-lg rounded-t-xl border border-border bg-surface px-5 pt-3 shadow-2xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-faint">
              {device.room} · {sourceLabel(device)} · {KIND_LABEL[device.kind]}
            </p>
            <h2 className="mt-1 font-display text-2xl text-fg">{device.name}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="閉じる">
            <X className="size-5" />
          </Button>
        </div>

        {device.extra && device.extra !== "水温" ? (
          <p className="mb-4 text-sm text-muted">{device.extra}</p>
        ) : null}

        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">名前</span>
            <input
              value={device.name}
              onChange={(e) => {
                updateDeviceMeta(device.id, { name: e.target.value });
                setRenamed(true);
              }}
              className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">場所</span>
            <select
              value={rooms.includes(device.room) ? device.room : rooms[0]}
              onChange={(e) => updateDeviceMeta(device.id, { room: e.target.value })}
              className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
            >
              {!rooms.includes(device.room) ? <option value={device.room}>{device.room}</option> : null}
              {rooms.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        {renamed ? (
          <p className="mb-4 rounded-md border border-border bg-bg px-3 py-2 text-xs text-muted">
            新しい名前は結ではもう使えます。Alexa の呼び名も変えるなら、Alexa アプリで
            もう一度デバイスを検出してください。
          </p>
        ) : null}

        {device.kind === "sensor" ? <SensorStats device={device} /> : null}

        <DeviceControls device={device} onChange={onChange} />

        {device.source === "demo" ? (
          <p className="mt-4 text-xs text-faint">デモ機器です。接続タブで実機を同期すると入れ替わります。</p>
        ) : (
          <p className="mt-4 text-xs text-faint">直結 · {sourceLabel(device)}</p>
        )}
      </div>
    </div>
  );
}

function SensorStats({ device }: { device: Device }) {
  const tempLabel = device.extra === "水温" ? "水温" : "気温";
  const stats = [
    device.temperature != null ? { label: tempLabel, value: `${device.temperature.toFixed(1)}°` } : null,
    device.humidity != null ? { label: "湿度", value: `${device.humidity}%` } : null,
    device.lux != null ? { label: "照度", value: `${device.lux}` } : null,
  ].filter((s): s is { label: string; value: string } => s != null);
  if (!stats.length) {
    return <p className="text-sm text-muted">計測中</p>;
  }
  return (
    <div className={`grid gap-2 ${stats.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
      {stats.map((s) => (
        <Stat key={s.label} label={s.label} value={s.value} />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-3">
      <p className="text-[11px] text-faint">{label}</p>
      <p className="mt-1 font-display text-xl tabular-nums text-fg">{value}</p>
    </div>
  );
}
