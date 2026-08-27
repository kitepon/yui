import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeviceControls } from "@/components/device-controls";
import { useHome } from "@/lib/home/store";
import { SENSOR_TICK_SECONDS } from "@/lib/home/control-tick";
import { applyDevicePatch, patchFromAction } from "@/lib/home/device-patch";
import { parseDecimalInput, roundToStep } from "@/lib/home/round-to-step";
import {
  type AutoAction,
  type AutoTrigger,
  type AutoTriggerType,
  type Automation,
  type Device,
  type TimeRepeat,
  METRIC_LABEL,
  WEEKDAYS,
  newActionId,
} from "@/lib/home/types";

export function AutomationEditor({
  initial,
  onClose,
}: {
  initial?: Automation | null;
  onClose: () => void;
}) {
  const devices = useHome((s) => s.devices);
  const scenes = useHome((s) => s.scenes);
  const addAutomation = useHome((s) => s.addAutomation);
  const updateAutomation = useHome((s) => s.updateAutomation);
  const [name, setName] = useState(initial?.name ?? "");
  const [trigger, setTrigger] = useState<AutoTrigger>(
    initial?.trigger ?? { type: "time", repeat: "daily", hour: 7, minute: 0 },
  );
  const [actions, setActions] = useState<AutoAction[]>(initial?.actions ?? []);

  const actuators = useMemo(() => devices.filter((d) => d.kind !== "sensor"), [devices]);
  const sensors = useMemo(
    () => devices.filter((d) => d.kind === "sensor" || (d.kind === "ac" && d.temperature != null)),
    [devices],
  );

  function setTriggerType(type: AutoTriggerType) {
    if (type === "time") setTrigger({ type, repeat: "daily", hour: 7, minute: 0 });
    if (type === "device") setTrigger({ type, deviceId: actuators[0]?.id, deviceOn: true });
    if (type === "scene") setTrigger({ type, sceneId: scenes[0]?.id });
    if (type === "sensor") {
      setTrigger({
        type,
        deviceId: sensors[0]?.id,
        metric: "temperature",
        op: "gte",
        value: 28,
      });
    }
  }

  function save() {
    if (!actions.length) {
      toast.error("アクションを1つ以上入れてください");
      return;
    }
    const payload = {
      name: name.trim() || "オートメーション",
      enabled: initial?.enabled ?? true,
      trigger,
      actions,
    };
    if (initial) updateAutomation(initial.id, { ...payload, lastFiredKey: undefined });
    else addAutomation(payload);
    toast.success("保存しました");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/70 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label="閉じる" onClick={onClose} />
      <div
        role="dialog"
        className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-surface px-5 pt-3"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <h2 className="font-display text-2xl text-fg">{initial ? "編集" : "新しいオートメーション"}</h2>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-muted">名前</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="暑い日は冷房"
            className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
          />
        </label>

        <p className="mt-5 text-xs tracking-wide text-faint">トリガー</p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {(
            [
              ["time", "時刻"],
              ["device", "機器"],
              ["sensor", "センサー"],
              ["scene", "場面"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTriggerType(id)}
              className={`h-11 rounded-md text-sm ${
                trigger.type === id ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {trigger.type === "time" ? (
          <div className="mt-3 space-y-2">
            <Select
              label="繰り返し"
              value={trigger.repeat ?? "daily"}
              onChange={(repeat) =>
                setTrigger({
                  ...trigger,
                  repeat: repeat as TimeRepeat,
                  everyHours: trigger.everyHours ?? 2,
                  days: trigger.days ?? [0, 6],
                })
              }
              options={[
                { id: "daily", label: "毎日" },
                { id: "interval", label: "何時間おき" },
                { id: "weekly", label: "曜日" },
              ]}
            />
            {(trigger.repeat ?? "daily") !== "interval" ? (
              <div className="grid grid-cols-2 gap-2">
                <Num label="時" value={trigger.hour ?? 7} min={0} max={23} onChange={(hour) => setTrigger({ ...trigger, hour })} />
                <Num label="分" value={trigger.minute ?? 0} min={0} max={59} onChange={(minute) => setTrigger({ ...trigger, minute })} />
              </div>
            ) : (
              <Num
                label="間隔（時間）"
                value={trigger.everyHours ?? 2}
                min={1}
                max={24}
                onChange={(everyHours) => setTrigger({ ...trigger, everyHours })}
              />
            )}
            {trigger.repeat === "weekly" ? (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = (trigger.days ?? []).includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        const days = new Set(trigger.days ?? []);
                        if (days.has(d.id)) days.delete(d.id);
                        else days.add(d.id);
                        setTrigger({ ...trigger, days: [...days].sort() });
                      }}
                      className={`size-11 rounded-md text-sm ${
                        on ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {trigger.type === "device" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Select
              label="機器"
              value={trigger.deviceId ?? ""}
              onChange={(deviceId) => setTrigger({ ...trigger, deviceId })}
              options={actuators.map((d) => ({ id: d.id, label: `${d.room} ${d.name}` }))}
            />
            <Select
              label="状態"
              value={trigger.deviceOn === false ? "off" : "on"}
              onChange={(v) => setTrigger({ ...trigger, deviceOn: v === "on" })}
              options={[
                { id: "on", label: "入ったとき" },
                { id: "off", label: "切ったとき" },
              ]}
            />
          </div>
        ) : null}

        {trigger.type === "scene" ? (
          <div className="mt-3">
            <Select
              label="場面"
              value={trigger.sceneId ?? ""}
              onChange={(sceneId) => setTrigger({ ...trigger, sceneId })}
              options={scenes.map((s) => ({ id: s.id, label: s.name }))}
            />
          </div>
        ) : null}

        {trigger.type === "sensor" ? (
          <div className="mt-3 space-y-2">
            <Select
              label="センサー"
              value={trigger.deviceId ?? ""}
              onChange={(deviceId) => setTrigger({ ...trigger, deviceId })}
              options={sensors.map((d) => ({ id: d.id, label: `${d.room} ${d.name}` }))}
            />
            <Select
              label="値"
              value={trigger.metric ?? "temperature"}
              onChange={(metric) => setTrigger({ ...trigger, metric: metric as AutoTrigger["metric"] })}
              options={Object.entries(METRIC_LABEL).map(([id, label]) => ({ id, label }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="条件"
                value={trigger.op ?? "gte"}
                onChange={(op) => setTrigger({ ...trigger, op: op as AutoTrigger["op"] })}
                options={[
                  { id: "gte", label: "以上" },
                  { id: "lte", label: "以下" },
                ]}
              />
              <Num
                label="しきい値"
                value={trigger.value ?? 28}
                min={0}
                max={100}
                step={0.1}
                onChange={(value) => setTrigger({ ...trigger, value })}
              />
            </div>
            <p className="text-xs leading-relaxed text-faint">
              しきい値は小数点第一位まで入れられます。センサーの値はサーバーが{SENSOR_TICK_SECONDS}
              秒ごとに確認します。条件を満たしてから動くまで最大{SENSOR_TICK_SECONDS}
              秒かかります。アプリを開いていなくても動きます。
            </p>
          </div>
        ) : null}

        <p className="mt-5 text-xs tracking-wide text-faint">アクション</p>
        <div className="mt-2 space-y-3">
          {actions.map((action, index) => (
            <ActionFields
              key={action.id}
              index={index}
              action={action}
              devices={actuators}
              onChange={(next) => setActions(actions.map((a) => (a.id === action.id ? next : a)))}
              onRemove={() => setActions(actions.filter((a) => a.id !== action.id))}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-12 w-full"
          onClick={() =>
            setActions([...actions, { id: newActionId(), deviceId: actuators[0]?.id, on: true }])
          }
        >
          機器を足す
        </Button>

        <Button className="mt-5 h-12 w-full" onClick={save}>
          保存
        </Button>
      </div>
    </div>
  );
}

function ActionFields({
  index,
  action,
  devices,
  onChange,
  onRemove,
}: {
  index: number;
  action: AutoAction;
  devices: Device[];
  onChange: (a: AutoAction) => void;
  onRemove: () => void;
}) {
  const device = devices.find((d) => d.id === action.deviceId);
  const preview = device ? { ...device, ...patchFromAction(action) } : null;
  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{index + 1}</p>
        <button type="button" className="h-10 px-2 text-sm text-muted" onClick={onRemove}>
          削除
        </button>
      </div>
      <Select
        label="機器"
        value={action.deviceId ?? ""}
        onChange={(deviceId) => onChange({ id: action.id, deviceId, on: true })}
        options={devices.map((d) => ({ id: d.id, label: `${d.room} ${d.name}` }))}
      />
      {preview ? (
        <div className="mt-3">
          <DeviceControls
            device={preview}
            onChange={(_, patch) => onChange(applyDevicePatch(action, preview, patch))}
          />
        </div>
      ) : null}
    </div>
  );
}

export function Num({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  // 打っている間は文字のまま持つ。1文字ごとに丸めると、消せなくなり、
  // 下限より小さい桁から始まる数（16〜32 の 2 など）が打てなくなる。
  const [draft, setDraft] = useState<string | null>(null);
  const decimal = step < 1;

  function commit(n: number, clamp: boolean) {
    const rounded = roundToStep(n, step);
    onChange(clamp ? Math.min(max, Math.max(min, rounded)) : rounded);
  }

  return (
    <label className="mt-2 block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        // iOS は type=number だと inputMode=decimal を無視し、小数点のないテンキーになる。
        type={decimal ? "text" : "number"}
        inputMode={decimal ? "decimal" : "numeric"}
        min={decimal ? undefined : min}
        max={decimal ? undefined : max}
        step={decimal ? undefined : step}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={draft ?? String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = parseDecimalInput(raw);
          if (n != null && n >= min && n <= max) {
            commit(n, false);
          }
        }}
        onBlur={(e) => {
          const raw = e.target.value;
          const n = parseDecimalInput(raw) ?? parseDecimalInput(raw.replace(/[.,]+$/, ""));
          if (n != null) {
            commit(n, true);
          }
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
      />
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="mt-2 block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
