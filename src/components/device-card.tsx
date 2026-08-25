import {
  AirVent,
  Blinds,
  Box,
  Lamp,
  Lock,
  Plug,
  Radio,
  Thermometer,
  ToggleLeft,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { connectorBadge, stripConnectorFromExtra, AC_MODE_LABEL, FAN_SPEED_LABEL, type Device, type DeviceKind } from "@/lib/home/types";

const ICONS: Record<DeviceKind, typeof Lamp> = {
  light: Lamp,
  ac: AirVent,
  plug: Plug,
  curtain: Blinds,
  bot: ToggleLeft,
  sensor: Thermometer,
  ir: Radio,
  lock: Lock,
  other: Box,
};

function statusLine(device: Device) {
  if (device.kind === "sensor") {
    const bits = [
      device.temperature != null ? `${device.temperature.toFixed(1)}°` : null,
      device.humidity != null ? `${device.humidity}%` : null,
    ].filter(Boolean);
    return bits.join(" · ") || "計測中";
  }
  if (device.kind === "ac") {
    if (!device.on) return "停止";
    const mode = device.mode ? AC_MODE_LABEL[device.mode] : "—";
    const bits = [`${mode} ${device.targetTemp ?? "—"}°`];
    if (device.fanSpeed) bits.push(FAN_SPEED_LABEL[device.fanSpeed]);
    return bits.join(" · ");
  }
  if (device.kind === "curtain") {
    return device.position === 0 ? "閉" : `開 ${device.position ?? 0}%`;
  }
  if (device.kind === "lock") return device.on ? "施錠" : "解錠";
  if (device.kind === "light" && device.on) return `${device.brightness ?? 100}%`;
  return device.on ? "入" : "切";
}

function detailLine(device: Device) {
  return [stripConnectorFromExtra(device.extra, device.connector) || null, statusLine(device)]
    .filter(Boolean)
    .join(" · ");
}

export function DeviceCard({
  device,
  onToggle,
  onOpen,
}: {
  device: Device;
  onToggle: (device: Device) => void;
  onOpen: (device: Device) => void;
}) {
  const Icon = ICONS[device.kind];
  const active = device.kind === "sensor" ? true : Boolean(device.on);
  const canToggle = device.kind !== "sensor" && device.kind !== "other";
  const tapToggles = canToggle && (device.kind === "light" || device.kind === "plug" || device.kind === "bot" || device.kind === "lock" || device.kind === "ir");

  return (
    <div
      className={cn(
        "relative flex min-h-40 flex-col justify-between rounded-lg border p-3 text-left transition-colors duration-200",
        active ? "border-primary/30 bg-surface" : "border-border bg-bg-2",
      )}
    >
      <button
        type="button"
        onClick={() => (tapToggles ? onToggle(device) : onOpen(device))}
        className="flex flex-1 flex-col items-start text-left"
        aria-label={
          tapToggles
            ? `${device.name}を${active ? "切る" : "入れる"}`
            : `${device.name}の詳細`
        }
      >
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-md bg-surface-2",
            active ? "text-primary" : "text-muted",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="mt-3 flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[10px] tracking-wide",
              device.source === "live" ? "bg-ok/15 text-ok" : "bg-surface-2 text-faint",
            )}
          >
            {connectorBadge(device)}
          </span>
        </span>
        <span className={cn("mt-1.5 text-[15px] font-medium leading-tight", active ? "text-fg" : "text-muted")}>
          {device.name}
        </span>
        <span className="mt-1 text-xs text-faint">{detailLine(device)}</span>
      </button>
      <div className="mt-3 flex gap-2">
        {canToggle ? (
          <button
            type="button"
            onClick={() => onToggle(device)}
            className={cn(
              "h-11 flex-1 rounded-md text-sm font-medium",
              active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted",
            )}
          >
            {device.kind === "lock" ? (device.on ? "施錠" : "解錠") : active ? "切る" : "入れる"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onOpen(device)}
          className="h-11 min-w-11 rounded-md bg-surface-2 px-3 text-sm text-muted"
        >
          詳細
        </button>
      </div>
    </div>
  );
}
