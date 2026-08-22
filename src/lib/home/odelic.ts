import type { Device } from "./types";

/**
 * オーデリック照明のコネクタ。
 *
 * 中身は自宅の odelic-bridge へ HTTP を投げるだけで、BLE も mesh の電文も一切知らない。
 * 解析で得た制御は商品機能として配らないという裁定（2026-08-21）の実装面がここで、
 * `YUI_ODELIC_BRIDGE_URL` を設定しない限り結の image にオーデリックの痕跡は出ない。
 */

const NOT_CONFIGURED = "オーデリックのブリッジ（YUI_ODELIC_BRIDGE_URL）が未設定です。";

interface BridgeHealth {
  ok: boolean;
  connected: boolean;
  authed: boolean;
  /** 短アドレス（"01 00 00 00" 形式）→ "明るさ 色" */
  status: Record<string, string>;
}

function bridgeUrl(): string {
  const url = process.env.YUI_ODELIC_BRIDGE_URL;
  if (!url) throw new Error(NOT_CONFIGURED);
  return url.replace(/\/$/, "");
}

async function bridgeFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${bridgeUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`オーデリック: ブリッジが HTTP ${res.status} を返しました`);
  }
  return res.json();
}

/** 短アドレス "05 00 00 00" を、人が読める並び順の番号にする。 */
function shortAddressLabel(key: string): string {
  const first = key.split(" ")[0] ?? key;
  return String(parseInt(first, 16));
}

export async function odelicSync(): Promise<{ devices: Device[]; rooms: string[] }> {
  const health = (await bridgeFetch("/health")) as BridgeHealth;
  if (!health.connected) {
    throw new Error(
      "オーデリック: ブリッジは動いていますが照明がまだ繋がっていません。数十秒おいて再同期してください。",
    );
  }

  const entries = Object.entries(health.status);
  if (!entries.length) {
    throw new Error("オーデリック: 照明の状態がまだ届いていません。少し待って再同期してください。");
  }

  const devices: Device[] = entries
    .map(([key, value]) => {
      const number = shortAddressLabel(key);
      const brightness = parseInt((value.split(" ")[0] ?? "0"), 16);
      return {
        id: `odelec:${key.replace(/ /g, "")}`,
        name: `オーデリック照明 ${number}`,
        room: "リビング",
        brand: "odelec" as const,
        kind: "light" as const,
        online: true,
        source: "live" as const,
        nativeId: key.replace(/ /g, ""),
        connector: "odelec" as const,
        on: brightness > 0,
        brightness,
      };
    })
    .sort((a, b) => a.nativeId.localeCompare(b.nativeId));

  return { devices, rooms: [...new Set(devices.map((d) => d.room))] };
}

/**
 * オーデリック照明の操作。
 *
 * 宛先はその照明の mesh アドレス（`nativeId`）で、1 台だけが動く。
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
