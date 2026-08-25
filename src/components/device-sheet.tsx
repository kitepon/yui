import { useState } from "react";
import { X } from "lucide-react";
import { AC_MODE_LABEL, DRY_HUMIDITY_CHOICES, FAN_SPEED_LABEL, FAN_SWING_LABEL, FAN_SWINGS, HUMIDIFY_HUMIDITY_CHOICES, KIND_LABEL, sourceLabel, type AcMode, type Device } from "@/lib/home/types";
import { useHome } from "@/lib/home/store";
import { Button } from "./ui/button";

const MODE_ORDER: AcMode[] = ["cool", "heat", "dry", "humidify", "fan", "auto"];

/** 能力表があればそのモードだけ、無ければ従来の5モード（デモ機器など。加湿は対応機だけ）。 */
function acModesOf(device: Device): AcMode[] {
  if (!device.acModes) return MODE_ORDER.filter((m) => m !== "humidify");
  return MODE_ORDER.filter((m) => device.acModes?.[m]);
}

/** いま操作対象のモードで選べる温度リスト。能力表が無ければ従来の 16〜32。 */
function acTempsOf(device: Device): string[] {
  const mode = device.mode ?? "auto";
  if (!device.acModes) return Array.from({ length: 17 }, (_, i) => String(16 + i));
  return device.acModes[mode] ?? [];
}

/** 相対値モード（自動の -5〜+5 など）は正に + を付けて示す。 */
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

        {device.kind === "light" || device.kind === "plug" || device.kind === "bot" || device.kind === "lock" ? (
          <Button
            className="h-14 w-full text-base"
            variant={device.on ? "default" : "outline"}
            onClick={() => onChange(device, { on: !device.on })}
          >
            {device.kind === "lock" ? (device.on ? "解錠する" : "施錠する") : device.on ? "切る" : "入れる"}
          </Button>
        ) : null}

        {device.kind === "light" && device.on ? (
          <label className="mt-5 block">
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
          <div className="space-y-4">
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
          </div>
        ) : null}

        {device.source === "demo" ? (
          <p className="mt-4 text-xs text-faint">デモ機器です。接続タブで実機を同期すると入れ替わります。</p>
        ) : (
          <p className="mt-4 text-xs text-faint">直結 · {sourceLabel(device)}</p>
        )}
      </div>
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
  // 同期直後の目標温度はリスト内にある。モード切替直後だけ外れうるので、
  // 相対値モードは中立の 0 から、絶対値モードは最寄りから歩き出す。
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

/** 除湿の目標湿度。対応機（targetHumidity を持つダイキン直結）の除湿中だけ出す。0 は「連続」。 */
function AcHumidityControl({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  if ((device.mode !== "dry" && device.mode !== "humidify") || device.targetHumidity == null) return null;
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

/** 風量。その運転で風量プロパティがあるときだけ（除湿は自動固定なので出さない）。 */
function AcFanSpeedControl({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  if (device.fanSpeed == null) return null;
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

/** 風向スイング。その運転で風向プロパティがあるときだけ。固定羽根の多段位置は出さない。 */
function AcFanSwingControl({
  device,
  onChange,
}: {
  device: Device;
  onChange: (device: Device, patch: Partial<Device>) => void;
}) {
  if (device.fanSwing == null) return null;
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
