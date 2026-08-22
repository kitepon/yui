import { createServerFn } from "@tanstack/react-start";
import { remoControl, remoSync } from "./remo";
import { switchbotControl, switchbotSync } from "./switchbot";
import { tuyaSync } from "./tuya";
import type { AcMode, Credentials, Device } from "./types";

export const syncNature = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    if (!data.token.trim()) throw new Error("Nature Remo のトークンが空です");
    return remoSync(data.token.trim());
  });

export const syncSwitchbot = createServerFn({ method: "POST" })
  .validator((data: { token: string; secret: string }) => data)
  .handler(async ({ data }) => {
    if (!data.token.trim() || !data.secret.trim()) {
      throw new Error("SwitchBot のトークンとシークレットが必要です");
    }
    return switchbotSync(data.token.trim(), data.secret.trim());
  });

export const syncTuya = createServerFn({ method: "POST" })
  .validator((data: { accessId: string; secret: string; uid: string; region?: string }) => data)
  .handler(async ({ data }) => {
    if (!data.accessId.trim() || !data.secret.trim() || !data.uid.trim()) {
      throw new Error("Tuya の Access ID / Secret / UID が必要です");
    }
    return tuyaSync(
      data.accessId.trim(),
      data.secret.trim(),
      data.uid.trim(),
      data.region?.trim() || "auto",
    );
  });

export const controlDevice = createServerFn({ method: "POST" })
  .validator(
    (data: {
      credentials: Credentials;
      device: Device;
      on?: boolean;
      brightness?: number;
      targetTemp?: number;
      mode?: AcMode;
      position?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { device, credentials } = data;
    if (device.source !== "live") return { ok: true as const, demo: true };

    if (device.connector === "nature") {
      await remoControl(credentials.natureToken, device, data);
      return { ok: true as const };
    }
    if (device.connector === "switchbot") {
      await switchbotControl(
        credentials.switchbotToken,
        credentials.switchbotSecret,
        device,
        data,
      );
      return { ok: true as const };
    }
    if (device.connector === "smartlife") {
      throw new Error("Smart Life の操作は次の段階です。いまは同期のみ対応しています。");
    }
    throw new Error("この機器はまだ直接操作できません");
  });
