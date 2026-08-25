import { toast } from "sonner";
import { serverControl, serverScene } from "./control-client";
import { useHome } from "./store";
import type { Device } from "./types";

export async function runCommand(device: Device, patch: Partial<Device>) {
  const { applyLocal, revertDevice, applySnapshot } = useHome.getState();
  const next = { ...device, ...patch };
  const prev = applyLocal({
    id: device.id,
    on: next.on,
    brightness: next.brightness,
    targetTemp: next.targetTemp,
    targetHumidity: next.targetHumidity,
    fanSpeed: next.fanSpeed,
    fanSwing: next.fanSwing,
    mode: next.mode,
    position: next.position,
  });
  try {
    const snap = await serverControl(device.id, patch);
    applySnapshot(snap);
  } catch (err) {
    if (prev) revertDevice(prev);
    toast.error(err instanceof Error ? err.message : "操作に失敗しました");
  }
}

export async function runScene(sceneId: string, name: string) {
  toast.success(`${name} をサーバーへ送りました`);
  try {
    const snap = await serverScene(sceneId);
    useHome.getState().applySnapshot(snap);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "場面の実行に失敗しました");
  }
}
