import type { Device } from "./types";

/**
 * オーデリック照明のコネクタ。
 *
 * 中身は自宅の odelic-bridge へ HTTP を投げるだけで、BLE も mesh の電文も一切知らない。
 * 解析で得た制御は商品機能として配らないという裁定（2026-08-21）の実装面がここで、
 * `YUI_ODELIC_BRIDGE_URL` を設定しない限り結の image にオーデリックの痕跡は出ない。
 */

const NOT_CONFIGURED = "オーデリックのブリッジ（YUI_ODELIC_BRIDGE_URL）が未設定です。";

interface BridgeScan {
  ok: boolean;
  connected: boolean;
  lights: Array<{ id: string; online: boolean; on?: boolean; brightness?: number }>;
}

function bridgeUrl(): string {
  const url = process.env.YUI_ODELIC_BRIDGE_URL;
  if (!url) throw new Error(NOT_CONFIGURED);
  return url.replace(/\/$/, "");
}

async function bridgeFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${bridgeUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(path === "/lights/scan" ? 60000 : 8000),
  });
  if (!res.ok) {
    throw new Error(`オーデリック: ブリッジが HTTP ${res.status} を返しました`);
  }
  return res.json();
}

export async function odelicSync(
  registered: Device[] = [],
): Promise<{ devices: Device[]; rooms: string[] }> {
  const scan = (await bridgeFetch("/lights/scan", { method: "POST" })) as BridgeScan;
  const known = new Map(
    registered
      .filter((device) => device.connector === "odelec")
      .map((device) => [device.id, device]),
  );
  const devices: Device[] = [...scan.lights]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((light, index) => {
      const id = `odelec:${light.id}`;
      const previous = known.get(id);
      return {
        ...previous,
        id,
        name: previous?.name ?? `オーデリック照明 ${index + 1}`,
        room: previous?.room ?? "リビング",
        brand: "odelec" as const,
        kind: "light" as const,
        online: light.online,
        source: "live" as const,
        nativeId: light.id,
        connector: "odelec" as const,
        on: light.on ?? previous?.on,
        brightness: light.brightness ?? previous?.brightness,
        extra: light.on === undefined ? "状態未取得" : undefined,
      };
    })
    .sort((a, b) => a.nativeId.localeCompare(b.nativeId));

  // 今回受信できなかった既存登録も残し、未検出と明示する。
  const observed = new Set(devices.map((device) => device.id));
  const missing = registered
    .filter(
      (device) =>
        device.connector === "odelec" && device.source === "live" && !observed.has(device.id),
    )
    .map((device) => ({ ...device, online: false, extra: "今回のスキャンでは未検出" }));
  const all = [...devices, ...missing].sort((a, b) => a.nativeId.localeCompare(b.nativeId));
  return { devices: all, rooms: [...new Set(all.map((d) => d.room))] };
}

/**
 * オーデリック照明の操作。
 *
 * 宛先はブリッジが発行した固定ID（`nativeId`）で、1 台だけが動く。
 * 宛先を持たない機器は無いはずだが、万一空なら全灯へ送らず断る——
 * 押した覚えのない照明が動くほうが害が大きい。
 */
export async function odelicControl(device: Device, cmd: { on?: boolean }) {
  if (cmd.on === undefined) {
    throw new Error(`${device.name} はオンとオフだけを操作できます`);
  }
  const address = device.nativeId?.trim();
  if (!address) {
    throw new Error(`${device.name} の宛先が分かりません。接続タブで一度同期してください。`);
  }
  const result = (await bridgeFetch(`/lights/${address}/${cmd.on ? "on" : "off"}`, {
    method: "POST",
  })) as { sent?: boolean; deferred?: boolean };

  if (result.deferred) {
    throw new Error(
      "オーデリック: 照明がまだ繋がっていないため指示を送れませんでした。次に繋がった時に反映されます。",
    );
  }
}
