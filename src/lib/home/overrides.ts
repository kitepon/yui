import type { Device, DeviceOverride } from "./types";

/**
 * 人が付けた名前と場所を機器へ当てる。
 *
 * 各社の同期は毎回それぞれの元の名前を返してくるので、当て直さないと
 * 改名が静かに元へ戻る。結の画面だけでなく Alexa の表示も戻るため、
 * クライアントとサーバの両方がここを通る。
 */
export function applyOverrides(
  devices: Device[],
  overrides: Record<string, DeviceOverride>,
): Device[] {
  return devices.map((device) => {
    const override = overrides[device.id];
    if (!override) return device;
    return {
      ...device,
      name: override.name?.trim() || device.name,
      room: override.room?.trim() || device.room,
    };
  });
}
