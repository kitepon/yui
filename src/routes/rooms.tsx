import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/lib/auth/gates";
import { ReorderButtons } from "@/components/reorder-buttons";
import { Button } from "@/components/ui/button";
import { sortByOrder, useHome } from "@/lib/home/store";

export const Route = createFileRoute("/rooms")({
  component: () => (
    <RequireAuth>
      <RoomsPage />
    </RequireAuth>
  ),
});

export function RoomsPage() {
  const rooms = useHome((s) => s.rooms);
  const raw = useHome((s) => s.devices);
  const deviceOrder = useHome((s) => s.deviceOrder);
  const devices = raw.some((d) => d.source === "live") ? raw.filter((d) => d.source === "live") : raw;
  const addRoom = useHome((s) => s.addRoom);
  const renameRoom = useHome((s) => s.renameRoom);
  const removeRoom = useHome((s) => s.removeRoom);
  const updateDeviceMeta = useHome((s) => s.updateDeviceMeta);
  const moveRoom = useHome((s) => s.moveRoom);
  const moveDevice = useHome((s) => s.moveDevice);
  const [draft, setDraft] = useState("");

  return (
    <AppShell>
      <header className="px-4 pt-5">
        <p className="text-[11px] tracking-[0.22em] text-faint">PLACES</p>
        <h1 className="mt-1 font-display text-3xl font-medium text-fg">場所</h1>
        <p className="mt-2 text-sm text-muted">上下で並べ替えます。機器も部屋の中で動かせます。</p>
      </header>

      <form
        className="mt-5 flex gap-2 px-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (addRoom(draft)) {
            toast.success(`${draft.trim()} を追加しました`);
            setDraft("");
          } else {
            toast.error("追加できません。同じ名前がないか確認してください。");
          }
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="書斎、子供部屋…"
          className="h-12 flex-1 rounded-md border border-border bg-surface px-3 text-base text-fg"
        />
        <Button type="submit" className="h-12 px-5">
          追加
        </Button>
      </form>

      <div className="mt-6 space-y-4 px-4">
        {rooms.map((room, roomIndex) => {
          const here = sortByOrder(
            devices.filter((d) => d.room === room),
            deviceOrder[room],
          );
          return (
            <section key={room} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <ReorderButtons
                  disableUp={roomIndex === 0}
                  disableDown={roomIndex === rooms.length - 1}
                  onUp={() => moveRoom(room, -1)}
                  onDown={() => moveRoom(room, 1)}
                />
                <input
                  defaultValue={room}
                  key={room}
                  className="h-12 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-base font-medium text-fg"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (!next || next === room) {
                      e.target.value = room;
                      return;
                    }
                    if (!renameRoom(room, next)) {
                      e.target.value = room;
                      toast.error("その名前は使えません");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted"
                  disabled={rooms.length <= 1}
                  onClick={() => {
                    removeRoom(room);
                    toast.message(`${room} を削除しました`);
                  }}
                >
                  削除
                </Button>
              </div>
              <p className="mt-2 text-xs text-faint">{here.length}台</p>
              <div className="mt-3 space-y-2">
                {here.length === 0 ? (
                  <p className="text-sm text-muted">まだ機器がありません。</p>
                ) : (
                  here.map((device, deviceIndex) => (
                    <div key={device.id} className="flex min-h-12 items-center gap-2">
                      <ReorderButtons
                        disableUp={deviceIndex === 0}
                        disableDown={deviceIndex === here.length - 1}
                        onUp={() => moveDevice(device.id, -1)}
                        onDown={() => moveDevice(device.id, 1)}
                      />
                      <span className="min-w-0 flex-1 text-sm text-fg">{device.name}</span>
                      <select
                        value={device.room}
                        onChange={(e) => updateDeviceMeta(device.id, { room: e.target.value })}
                        className="h-11 rounded-md border border-border bg-bg px-2 text-sm text-fg"
                      >
                        {rooms.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
