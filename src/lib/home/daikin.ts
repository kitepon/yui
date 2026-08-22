import { request as httpRequest } from "node:http";
import type { AcMode, Device } from "./types.ts";

/**
 * ダイキンエアコンの直結コネクタ（読み取り）。
 *
 * 宛先は無線LAN内蔵/アダプター搭載機のローカル DSIOT API（/dsiot/multireq）で、
 * クラウドも DaikinAPP も通らない。`YUI_DAIKIN_ADDRS` を設定しない限り
 * 結の image にダイキン直結の痕跡は出ない（例: "リビング=192.168.1.16"）。
 *
 * プロパティの対応は local_daikin（Apoc182）の解読表を実機 F80XTRXP（2020 うるさらX）で
 * 突き合わせて確定させたもの:
 *   e_A002/p_01 電源、e_3001/p_01 運転モード、e_3001/p_02・p_03 冷房・暖房目標（値は温度×2）、
 *   e_A00B/p_01 室温、e_A00B/p_02 湿度。
 */

const NOT_CONFIGURED = "ダイキン直結（YUI_DAIKIN_ADDRS）が未設定です。";

/** "リビング=192.168.1.16,寝室=…" または素の IP の並びを部屋→宛先に読む。 */
export function parseDaikinAddrs(raw: string | undefined): Array<{ room: string; host: string }> {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf("=");
      if (eq < 0) return { room: "その他", host: entry };
      return { room: entry.slice(0, eq).trim(), host: entry.slice(eq + 1).trim() };
    });
}

function configuredAddrs() {
  const list = parseDaikinAddrs(process.env.YUI_DAIKIN_ADDRS);
  if (!list.length) throw new Error(NOT_CONFIGURED);
  return list;
}

interface DsiotNode {
  pn?: string;
  pv?: unknown;
  md?: { st?: number; mi?: string; mx?: string };
  pch?: DsiotNode[];
}

/**
 * アダプターの組込 HTTP サーバはヘッダー名の大文字小文字を区別し、
 * 小文字だと 403 を返す（実測）。fetch(undici) は常に小文字で送るため使えず、
 * 名前の大文字を保つ node:http で送る。
 */
function postMultireq(host: string, payload: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host,
        path: "/dsiot/multireq",
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.setTimeout(8000, () => req.destroy(new Error(`ダイキン: ${host} が応答しません`)));
    req.on("error", reject);
    req.end(payload);
  });
}

async function multireq(host: string, requests: unknown[]): Promise<DsiotNode[]> {
  const res = await postMultireq(host, JSON.stringify({ requests }));
  if (res.status !== 200) {
    throw new Error(`ダイキン: ${host} が HTTP ${res.status} を返しました`);
  }
  const json = JSON.parse(res.body) as { responses?: Array<{ fr?: string; rsc?: number; pc?: DsiotNode }> };
  const bad = (json.responses ?? []).find((r) => (r.rsc ?? 2000) >= 4000);
  if (bad) throw new Error(`ダイキン: ${host} の ${bad.fr} が rsc ${bad.rsc} を返しました`);
  return (json.responses ?? []).map((r) => r.pc).filter((p): p is DsiotNode => Boolean(p));
}

/** 木構造を "/e_1002/e_3001/p_02" → ノード の平面に写す。 */
export function flattenDsiot(roots: DsiotNode[]): Map<string, DsiotNode> {
  const out = new Map<string, DsiotNode>();
  const walk = (node: DsiotNode, path: string) => {
    const p = node.pn ? `${path}/${node.pn}` : path;
    if (node.pv !== undefined) out.set(p, node);
    for (const ch of node.pch ?? []) walk(ch, p);
  };
  for (const root of roots) walk(root, "");
  return out;
}

const MODE_FROM_DSIOT: Record<string, AcMode> = {
  "0300": "auto",
  "0200": "cool",
  "0100": "heat",
  "0000": "fan",
  "0500": "dry",
  "0800": "humidify",
};

/** 温度×2 で入っている1バイト値を °C に。 */
function halfDeg(hex: unknown): number | undefined {
  if (typeof hex !== "string" || !hex) return undefined;
  return parseInt(hex, 16) / 2;
}

/** 符号付き1バイトの整数（室温・湿度）。 */
function signedByte(hex: unknown): number | undefined {
  if (typeof hex !== "string" || !hex) return undefined;
  const v = parseInt(hex, 16);
  return v > 0x7f ? v - 0x100 : v;
}

/** md の mi〜mx（温度×2）から選べる温度リストを 0.5 刻みで作る。 */
export function tempListFromRange(md?: { mi?: string; mx?: string }): string[] {
  if (!md?.mi || !md.mx) return [];
  const lo = parseInt(md.mi, 16) / 2;
  const hi = parseInt(md.mx, 16) / 2;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
  const out: string[] = [];
  for (let t = lo; t <= hi; t += 0.5) out.push(String(t));
  return out;
}

export function deviceFromDsiot(
  room: string,
  host: string,
  mac: string,
  status: Map<string, DsiotNode>,
): Device {
  const modeRaw = String(status.get("/dgc_status/e_1002/e_3001/p_01")?.pv ?? "");
  const mode = MODE_FROM_DSIOT[modeRaw];
  const cool = status.get("/dgc_status/e_1002/e_3001/p_02");
  const heat = status.get("/dgc_status/e_1002/e_3001/p_03");
  const auto = status.get("/dgc_status/e_1002/e_3001/p_1D");
  const targetNode = mode === "cool" ? cool : mode === "heat" ? heat : mode === "auto" ? auto : undefined;
  const acModes: Device["acModes"] = {
    cool: tempListFromRange(cool?.md),
    heat: tempListFromRange(heat?.md),
    dry: [],
    fan: [],
  };
  // 自動の目標温度プロパティ（p_1D）を持たない機種でも自動運転自体はできる。
  acModes.auto = auto ? tempListFromRange(auto.md) : [];
  // 加湿（うるる加湿）を持つ機種は目標湿度 p_32 を公開する。それを対応の印にする。
  if (status.get("/dgc_status/e_1002/e_3001/p_32")) acModes.humidify = [];
  // 目標湿度: 除湿は p_31 が種別（01=湿度指定 / 06=連続）・p_30 が %、加湿は p_33・p_32 の対（実機観測）
  const humidityOf = (kindProp: string, pctProp: string) => {
    const kind = status.get(`/dgc_status/e_1002/e_3001/${kindProp}`)?.pv;
    if (kind === "06") return 0;
    return signedByte(status.get(`/dgc_status/e_1002/e_3001/${pctProp}`)?.pv);
  };
  const dryHumidity =
    mode === "dry" ? humidityOf("p_31", "p_30") : mode === "humidify" ? humidityOf("p_33", "p_32") : undefined;
  return {
    id: `daikin:${mac}`,
    name: "ダイキンエアコン",
    room,
    brand: "daikin",
    kind: "ac",
    online: true,
    source: "live",
    nativeId: host,
    connector: "daikin",
    on: status.get("/dgc_status/e_1002/e_A002/p_01")?.pv === "01",
    mode,
    targetTemp: halfDeg(targetNode?.pv),
    targetHumidity: dryHumidity,
    temperature: signedByte(status.get("/dgc_status/e_1002/e_A00B/p_01")?.pv),
    humidity: signedByte(status.get("/dgc_status/e_1002/e_A00B/p_02")?.pv),
    acModes,
    extra: `直結 · ${host}`,
  };
}

async function readOne(room: string, host: string): Promise<Device> {
  const [info, statusRoots] = await Promise.all([
    multireq(host, [{ op: 2, to: "/dsiot/edge.adp_i" }]),
    multireq(host, [{ op: 2, to: "/dsiot/edge/adr_0100.dgc_status?filter=pv,pt,md" }]),
  ]);
  const mac = String(flattenDsiot(info).get("/adp_i/mac")?.pv ?? host.replace(/\./g, "-"));
  return deviceFromDsiot(room, host, mac, flattenDsiot(statusRoots));
}

export async function daikinSync(): Promise<{ devices: Device[] }> {
  const devices = await Promise.all(configuredAddrs().map((a) => readOne(a.room, a.host)));
  return { devices };
}

export function daikinConfigured(): boolean {
  return parseDaikinAddrs(process.env.YUI_DAIKIN_ADDRS).length > 0;
}

const MODE_TO_DSIOT: Partial<Record<AcMode, string>> = {
  auto: "0300",
  cool: "0200",
  heat: "0100",
  fan: "0000",
  dry: "0500",
  humidify: "0800",
};

/** 温度×2 の1バイト hex（大文字）。実機の値表記に合わせる。 */
function toHalfDegHex(temp: number): string {
  return Math.round(temp * 2).toString(16).padStart(2, "0").toUpperCase();
}

interface DsiotWrite {
  pn: string;
  pch: Array<{ pn: string; pv: string }>;
}

/**
 * 操作を DSIOT の書き込み木にする。device は patch 適用後の姿。
 * 温度はそのモードで選べる値へ写し、写せないモード（除湿・送風・相対値）へは送らない。
 */
export function buildDaikinWrite(
  device: Device,
  cmd: { on?: boolean; targetTemp?: number; targetHumidity?: number; mode?: AcMode },
): DsiotWrite[] {
  if (cmd.on === false) {
    return [{ pn: "e_A002", pch: [{ pn: "p_01", pv: "00" }] }];
  }
  const entities: DsiotWrite[] = [];
  if (cmd.on) entities.push({ pn: "e_A002", pch: [{ pn: "p_01", pv: "01" }] });
  const props: Array<{ pn: string; pv: string }> = [];
  if (cmd.mode) {
    const pv = MODE_TO_DSIOT[cmd.mode];
    if (!pv) throw new Error(`${device.name} は「${cmd.mode}」に対応していません`);
    props.push({ pn: "p_01", pv });
  }
  if (cmd.targetTemp != null) {
    const mode = device.mode;
    const prop = mode === "cool" ? "p_02" : mode === "heat" ? "p_03" : null;
    const list = mode ? device.acModes?.[mode] : undefined;
    if (prop && list?.length) {
      const hit = list.reduce((a, b) =>
        Math.abs(Number(b) - cmd.targetTemp!) < Math.abs(Number(a) - cmd.targetTemp!) ? b : a,
      );
      props.push({ pn: prop, pv: toHalfDegHex(Number(hit)) });
    }
  }
  if (cmd.targetHumidity != null && (device.mode === "dry" || device.mode === "humidify")) {
    const [kindProp, pctProp] = device.mode === "dry" ? ["p_31", "p_30"] : ["p_33", "p_32"];
    if (cmd.targetHumidity === 0) {
      props.push({ pn: kindProp, pv: "06" });
    } else {
      props.push({ pn: kindProp, pv: "01" });
      props.push({ pn: pctProp, pv: cmd.targetHumidity.toString(16).padStart(2, "0").toUpperCase() });
    }
  }
  if (props.length) entities.push({ pn: "e_3001", pch: props });
  return entities;
}

export async function daikinControl(
  device: Device,
  cmd: { on?: boolean; targetTemp?: number; targetHumidity?: number; mode?: AcMode },
) {
  const host = device.nativeId?.trim();
  if (!host) {
    throw new Error(`${device.name} の宛先が分かりません。接続タブで一度同期してください。`);
  }
  const entities = buildDaikinWrite(device, cmd);
  if (!entities.length) return;
  const res = await postMultireq(
    host,
    JSON.stringify({
      requests: [
        {
          op: 3,
          to: "/dsiot/edge/adr_0100.dgc_status",
          pc: { pn: "dgc_status", pch: [{ pn: "e_1002", pch: entities }] },
        },
      ],
    }),
  );
  if (res.status !== 200) {
    throw new Error(`ダイキン: ${host} が HTTP ${res.status} を返しました`);
  }
  const rsc = (JSON.parse(res.body) as { responses?: Array<{ rsc?: number }> }).responses?.[0]?.rsc;
  if (rsc !== 2004) {
    throw new Error(`ダイキン: ${host} が書き込みを受け付けませんでした（rsc ${rsc}）`);
  }
}
