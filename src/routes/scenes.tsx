import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AutomationEditor } from "@/components/automation-editor";
import { SceneEditor } from "@/components/scene-editor";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/lib/auth/gates";
import { ReorderButtons } from "@/components/reorder-buttons";
import { Button } from "@/components/ui/button";
import { describeAction, describeTrigger, executeAutomation } from "@/lib/home/run-automation";
import { runScene } from "@/lib/home/run";
import { useHome } from "@/lib/home/store";
import type { Automation, Scene } from "@/lib/home/types";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/scenes")({
  component: () => (
    <RequireAuth>
      <ScenesPage />
    </RequireAuth>
  ),
});

export function ScenesPage() {
  const lastScene = useHome((s) => s.lastScene);
  const scenes = useHome((s) => s.scenes);
  const moveScene = useHome((s) => s.moveScene);
  const removeScene = useHome((s) => s.removeScene);
  const automations = useHome((s) => s.automations);
  const toggleAutomation = useHome((s) => s.toggleAutomation);
  const removeAutomation = useHome((s) => s.removeAutomation);
  const [editingAuto, setEditingAuto] = useState<Automation | null | "new">(null);
  const [editingScene, setEditingScene] = useState<Scene | null | "new">(null);

  return (
    <AppShell>
      <header className="px-4 pt-5">
        <p className="text-[11px] tracking-[0.22em] text-faint">SCENES</p>
        <h1 className="mt-1 font-display text-3xl font-medium text-fg">場面</h1>
        <p className="mt-2 text-sm text-muted">追加・削除・並べ替えができます。</p>
      </header>
      <div className="mt-6 space-y-3 px-4">
        {scenes.map((scene, index) => (
          <div
            key={scene.id}
            className={cn(
              "flex items-stretch gap-2 rounded-lg border px-3 py-2",
              lastScene === scene.id ? "border-primary/40 bg-surface" : "border-border bg-bg-2",
            )}
          >
            <ReorderButtons
              disableUp={index === 0}
              disableDown={index === scenes.length - 1}
              onUp={() => moveScene(scene.id, -1)}
              onDown={() => moveScene(scene.id, 1)}
            />
            <button
              type="button"
              onClick={() => runScene(scene.id, scene.name)}
              className="min-h-16 min-w-0 flex-1 py-2 text-left"
            >
              <span className="block font-display text-2xl text-fg">{scene.name}</span>
              {scene.hint ? <span className="mt-1 block text-sm text-muted">{scene.hint}</span> : null}
            </button>
            <div className="flex flex-col justify-center gap-1">
              <button type="button" className="h-10 px-2 text-sm text-fg" onClick={() => setEditingScene(scene)}>
                編集
              </button>
              <button type="button" className="h-10 px-2 text-sm text-muted" onClick={() => removeScene(scene.id)}>
                削除
              </button>
            </div>
          </div>
        ))}
        <Button className="h-12 w-full" variant="outline" onClick={() => setEditingScene("new")}>
          場面を追加
        </Button>
      </div>

      <section className="mt-10 px-4">
        <p className="text-[11px] tracking-[0.22em] text-faint">AUTOMATION</p>
        <h2 className="mt-1 font-display text-2xl text-fg">オートメーション</h2>
        <Button className="mt-4 h-12 w-full" onClick={() => setEditingAuto("new")}>
          新しく作る
        </Button>

        <div className="mt-4 space-y-2">
          {automations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">まだありません。</p>
          ) : (
            automations.map((auto) => (
              <div key={auto.id} className="rounded-lg border border-border bg-bg-2 px-4 py-3">
                <p className="text-base text-fg">{auto.name}</p>
                <p className="mt-1 text-xs text-faint">
                  {describeTrigger(auto)} → {auto.actions.map(describeAction).join("、") || "アクションなし"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-11 rounded-md bg-surface px-3 text-sm text-fg"
                    onClick={() => toggleAutomation(auto.id)}
                  >
                    {auto.enabled ? "止める" : "入れる"}
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-md bg-surface px-3 text-sm text-fg"
                    onClick={() => setEditingAuto(auto)}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-md bg-surface px-3 text-sm text-fg"
                    onClick={() => void executeAutomation({ ...auto, enabled: true })}
                  >
                    今すぐ
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-md px-3 text-sm text-muted"
                    onClick={() => removeAutomation(auto.id)}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {editingAuto ? (
        <AutomationEditor
          initial={editingAuto === "new" ? null : editingAuto}
          onClose={() => setEditingAuto(null)}
        />
      ) : null}
      {editingScene ? (
        <SceneEditor
          initial={editingScene === "new" ? null : editingScene}
          onClose={() => setEditingScene(null)}
        />
      ) : null}
    </AppShell>
  );
}
