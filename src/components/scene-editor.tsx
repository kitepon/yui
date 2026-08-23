import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Num, Select } from "@/components/automation-editor";
import { Button } from "@/components/ui/button";
import { useHome } from "@/lib/home/store";
import { type Scene, type SceneStep, newActionId } from "@/lib/home/types";

export function SceneEditor({
  initial,
  onClose,
}: {
  initial?: Scene | null;
  onClose: () => void;
}) {
  const devices = useHome((s) => s.devices);
  const addScene = useHome((s) => s.addScene);
  const updateScene = useHome((s) => s.updateScene);
  const [name, setName] = useState(initial?.name ?? "");
  const [hint, setHint] = useState(initial?.hint ?? "");
  const [steps, setSteps] = useState<SceneStep[]>(initial?.steps ?? []);
  const actuators = useMemo(() => devices.filter((d) => d.kind !== "sensor"), [devices]);

  function save() {
    if (!name.trim()) {
      toast.error("名前を入れてください");
      return;
    }
    const payload = { name: name.trim(), hint: hint.trim(), steps };
    if (initial) updateScene(initial.id, payload);
    else addScene(payload);
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
        <h2 className="font-display text-2xl text-fg">{initial ? "場面を編集" : "新しい場面"}</h2>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-muted">名前</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-muted">説明</span>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
          />
        </label>

        <p className="mt-5 text-xs tracking-wide text-faint">動かす機器</p>
        <div className="mt-2 space-y-3">
          {steps.map((step, index) => {
            const id = step.match.id ?? "";
            const kind = actuators.find((d) => d.id === id)?.kind;
            return (
              <div key={index} className="rounded-md border border-border bg-bg p-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="h-10 text-sm text-muted"
                    onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                  >
                    削除
                  </button>
                </div>
                <Select
                  label="機器"
                  value={id}
                  onChange={(deviceId) =>
                    setSteps(steps.map((s, i) => (i === index ? { ...s, match: { id: deviceId } } : s)))
                  }
                  options={actuators.map((d) => ({ id: d.id, label: `${d.room} ${d.name}` }))}
                />
                <Select
                  label="操作"
                  value={step.patch.on === false ? "off" : "on"}
                  onChange={(v) =>
                    setSteps(
                      steps.map((s, i) => (i === index ? { ...s, patch: { ...s.patch, on: v === "on" } } : s)),
                    )
                  }
                  options={[
                    { id: "on", label: "入れる" },
                    { id: "off", label: "切る" },
                  ]}
                />
                {kind === "light" ? (
                  <Num
                    label="明るさ"
                    value={step.patch.brightness ?? 80}
                    min={1}
                    max={100}
                    onChange={(brightness) =>
                      setSteps(
                        steps.map((s, i) => (i === index ? { ...s, patch: { ...s.patch, brightness } } : s)),
                      )
                    }
                  />
                ) : null}
                {kind === "ac" ? (
                  <Num
                    label="温度"
                    value={step.patch.targetTemp ?? 26}
                    min={16}
                    max={32}
                    onChange={(targetTemp) =>
                      setSteps(
                        steps.map((s, i) => (i === index ? { ...s, patch: { ...s.patch, targetTemp } } : s)),
                      )
                    }
                  />
                ) : null}
                {kind === "curtain" ? (
                  <Num
                    label="開き"
                    value={step.patch.position ?? 100}
                    min={0}
                    max={100}
                    onChange={(position) =>
                      setSteps(
                        steps.map((s, i) => (i === index ? { ...s, patch: { ...s.patch, position } } : s)),
                      )
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-12 w-full"
          onClick={() =>
            setSteps([
              ...steps,
              { match: { id: actuators[0]?.id ?? newActionId() }, patch: { on: true } },
            ])
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
