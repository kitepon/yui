import {
  AC_MODE_LABEL,
  DRY_HUMIDITY_CHOICES,
  FAN_SPEED_LABEL,
  FAN_SWING_LABEL,
  FAN_SWINGS,
  HUMIDIFY_HUMIDITY_CHOICES,
  type Device,
} from "@/lib/home/types";
import {
  acModesOf,
  acTempsOf,
  canSetFanSpeed,
  canSetFanSwing,
  canSetTargetHumidity,
} from "@/lib/home/device-patch";
import { Button } from "./ui/button";

export function DeviceControls({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  if (device.kind === "sensor") return null;

  return (
    <div className="space-y-4">
      {device.kind === "light" ||
      device.kind === "plug" ||
      device.kind === "bot" ||
      device.kind === "lock" ||
      device.kind === "ir" ? (
        <Button
          className="h-14 w-full text-base"
          variant={device.on ? "default" : "outline"}
          onClick={() => onChange(device, { on: !device.on })}
        >
          {device.kind === "lock" ? (device.on ? "解錠する" : "施錠する") : device.on ? "切る" : "入れる"}
        </Button>
      ) : null}

      {device.kind === "light" && device.on ? (
        <label className="block">
          <span className="mb-1 flex justify-between text-sm text-muted">
            明るさ <span className="tabular-nums text-fg">{device.brightness ?? 80}%</span>
          </span>
          <input
            type="range"
            min={1}
            max={100}
            value={device.brightness ?? 80}
            onChange={(e) => onChange(device, { brightness: Number(e.target.value), on: true })}
            className="w-full accent-primary"
          />
        </label>
      ) : null}

      {device.kind === "curtain" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-14" variant="outline" onClick={() => onChange(device, { position: 0, on: false })}>
              閉める
            </Button>
            <Button className="h-14" onClick={() => onChange(device, { position: 100, on: true })}>
              開ける
            </Button>
          </div>
          <label className="block">
            <span className="mb-1 flex justify-between text-sm text-muted">
              開き <span className="tabular-nums text-fg">{device.position ?? 0}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={device.position ?? 0}
              onChange={(e) =>
                onChange(device, {
                  position: Number(e.target.value),
                  on: Number(e.target.value) > 0,
                })
              }
              className="w-full accent-primary"
            />
          </label>
        </div>
      ) : null}

      {device.kind === "ac" ? (
        <>
          <Button
            className="h-14 w-full text-base"
            variant={device.on ? "default" : "outline"}
            onClick={() => onChange(device, { on: !device.on })}
          >
            {device.on ? "停止" : "運転"}
          </Button>
          <AcModeButtons device={device} onChange={onChange} />
          <AcTempControl device={device} onChange={onChange} />
          <AcHumidityControl device={device} onChange={onChange} />
          <AcFanSpeedControl device={device} onChange={onChange} />
          <AcFanSwingControl device={device} onChange={onChange} />
        </>
      ) : null}
    </div>
  );
}

function AcModeButtons({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  const modes = acModesOf(device);
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${modes.length}, 1fr)` }}>
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(device, { mode: m, on: true })}
          className={`h-12 rounded-sm text-xs ${
            device.mode === m ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"
          }`}
        >
          {AC_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

function tempLabel(temps: string[], value: number) {
  const relative = temps.some((t) => Number(t) < 0);
  return relative && value > 0 ? `+${value}` : `${value}`;
}

function nearestIndex(temps: string[], target: number) {
  let best = 0;
  temps.forEach((t, i) => {
    if (Math.abs(Number(t) - target) < Math.abs(Number(temps[best]) - target)) best = i;
  });
  return best;
}

function AcTempControl({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  const temps = acTempsOf(device);
  if (!temps.length) return null;
  const relative = temps.some((t) => Number(t) < 0);
  const exact = temps.findIndex((t) => Number(t) === device.targetTemp);
  const index = exact >= 0 ? exact : relative ? Math.max(temps.indexOf("0"), 0) : nearestIndex(temps, device.targetTemp ?? 26);
  const shown = exact >= 0 || !relative ? tempLabel(temps, Number(temps[index])) : "—";
  const step = (dir: -1 | 1) => {
    const next = Math.min(temps.length - 1, Math.max(0, (exact >= 0 ? index + dir : index)));
    onChange(device, { targetTemp: Number(temps[next]), on: true });
  };
  return (
    <div className="flex items-center justify-between rounded-md bg-surface-2 px-2 py-2">
      <button type="button" className="size-14 text-3xl text-fg" onClick={() => step(-1)}>
        −
      </button>
      <p className="font-display text-5xl tabular-nums text-fg">
        {shown}
        <span className="ml-1 text-lg text-muted">°</span>
      </p>
      <button type="button" className="size-14 text-3xl text-fg" onClick={() => step(1)}>
        ＋
      </button>
    </div>
  );
}

function AcHumidityControl({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  if (!canSetTargetHumidity(device)) return null;
  const choices = device.mode === "dry" ? DRY_HUMIDITY_CHOICES : HUMIDIFY_HUMIDITY_CHOICES;
  return (
    <div>
      <p className="mb-1 text-sm text-muted">目標湿度</p>
      <div className="grid grid-cols-4 gap-1.5">
        {choices.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onChange(device, { targetHumidity: h, on: true })}
            className={`h-12 rounded-sm text-xs ${
              device.targetHumidity === h ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"
            }`}
          >
            {h === 0 ? "連続" : `${h}%`}
          </button>
        ))}
      </div>
    </div>
  );
}

function acChipClass(active: boolean) {
  return `h-12 rounded-sm text-xs ${active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"}`;
}

function AcFanSpeedControl({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  if (!canSetFanSpeed(device)) return null;
  return (
    <div>
      <p className="mb-1 text-sm text-muted">風量</p>
      <div className="mb-1.5 grid grid-cols-2 gap-1.5">
        {(["auto", "quiet"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(device, { fanSpeed: s, on: true })}
            className={acChipClass(device.fanSpeed === s)}
          >
            {FAN_SPEED_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {(["1", "2", "3", "4", "5"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(device, { fanSpeed: s, on: true })}
            className={acChipClass(device.fanSpeed === s)}
          >
            {FAN_SPEED_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

function AcFanSwingControl({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  if (!canSetFanSwing(device)) return null;
  return (
    <div>
      <p className="mb-1 text-sm text-muted">風向</p>
      <div className="grid grid-cols-4 gap-1.5">
        {FAN_SWINGS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(device, { fanSwing: s, on: true })}
            className={acChipClass(device.fanSwing === s)}
          >
            {FAN_SWING_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
