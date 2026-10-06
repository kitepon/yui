import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Num } from "@/components/automation-editor";
import { Button } from "@/components/ui/button";
import {
  GROUP_LOCK_MINUTES_DEFAULT,
  GROUP_LOCK_MINUTES_MAX,
  GROUP_LOCK_MINUTES_MIN,
  clampLockMinutes,
} from "@/lib/home/device-group";
import { useHome } from "@/lib/home/store";
import type { DeviceGroup } from "@/lib/home/types";

export function DeviceGroupEditor({
  initial,
  onClose,
}: {
  initial?: DeviceGroup | null;
  onClose: () => void;
}) {
  const devices = useHome((s) => s.devices);
  const groups = useHome((s) => s.deviceGroups);
  const saveDeviceGroup = useHome((s) => s.saveDeviceGroup);
  const [name, setName] = useState(initial?.name ?? "");
  const [deviceIds, setDeviceIds] = useState<string[]>(initial?.deviceIds ?? []);
  const [lockMinutes, setLockMinutes] = useState(initial?.lockMinutes ?? GROUP_LOCK_MINUTES_DEFAULT);

  const actuators = useMemo(() => devices.filter((d) => d.kind !== "sensor"), [devices]);
  const otherGroupOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups ?? []) {
      if (group.id === initial?.id) continue;
      for (const id of group.deviceIds) map.set(id, group.name);
    }
    return map;
  }, [groups, initial?.id]);
  // 同期で一時的に消えた機器。外すまでグループに残す。
  const missing = deviceIds.filter((id) => !devices.some((d) => d.id === id));

  function toggle(id: string) {
    setDeviceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function save() {
    if (!deviceIds.length) {
      toast.error("機器を1つ以上選んでください");
      return;
    }
    saveDeviceGroup({
      id: initial?.id,
      name: name.trim() || "グループ",
      deviceIds,
      lockMinutes: clampLockMinutes(lockMinutes),
    });
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
        <h2 className="font-display text-2xl text-fg">{initial ? "グループを編集" : "新しいグループ"}</h2>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-muted">名前</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="換気扇"
            className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
          />
        </label>

        <p className="mt-5 text-xs tracking-wide text-faint">機器</p>
        <div className="mt-2 space-y-1.5">
          {actuators.map((device) => {
            const on = deviceIds.includes(device.id);
            const other = otherGroupOf.get(device.id);
            return (
              <button
                key={device.id}
                type="button"
                aria-pressed={on}
                disabled={Boolean(other)}
                onClick={() => toggle(device.id)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm disabled:opacity-50 ${
                  on ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"
                }`}
              >
                <span className="min-w-0 truncate">
                  {device.room} {device.name}
                </span>
                <span className="shrink-0 text-xs">{other ? `「${other}」に入っています` : on ? "選択中" : ""}</span>
              </button>
            );
          })}
          {missing.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed
              onClick={() => toggle(id)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md bg-primary px-3 py-2 text-left text-sm text-primary-fg"
            >
              <span>見つからない機器</span>
              <span className="shrink-0 text-xs">押すと外す</span>
            </button>
          ))}
          {actuators.length === 0 ? <p className="py-3 text-sm text-muted">機器を接続すると選べます。</p> : null}
        </div>

        <Num
          label="操作を止める時間（分）"
          value={lockMinutes}
          min={GROUP_LOCK_MINUTES_MIN}
          max={GROUP_LOCK_MINUTES_MAX}
          onChange={setLockMinutes}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-faint">
          グループのどれかを動かすと、この時間はグループの機器をオートメーションから動かしません。手で押した操作、場面、Alexaは止めません。それらもグループを動かした扱いになり、時間を数え直します。止めた操作は最後の1件だけ覚えておき、時間が明けたときに条件がまだ成立していれば送ります。
        </p>

        <Button className="mt-5 h-12 w-full" onClick={save}>
          保存
        </Button>
      </div>
    </div>
  );
}
