import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { emptySnapshot, type HomeSnapshot } from "@/lib/home/snapshot";
import { migrateAutomation } from "@/lib/home/types";
import { applyOverrides } from "@/lib/home/overrides";
import { daikinConfigured } from "@/lib/home/daikin";
import {
  credentialFlags,
  decryptJson,
  encryptJson,
  mergeIncomingCredentials,
  publicCredentials,
  secretsKeyFromEnv,
} from "./home-secrets";
import { getSqlite } from "./sqlite";

type HomeRow = {
  id: string;
  owner_user_id: string;
  pair_pin: string;
  credentials_enc: string;
  body_json: string;
  has_enabled_automation: number;
};

function newPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function bodyOf(snap: HomeSnapshot) {
  return {
    devices: snap.devices,
    climate: snap.climate,
    connectors: snap.connectors,
    rooms: snap.rooms,
    overrides: snap.overrides,
    deviceOrder: snap.deviceOrder,
    scenes: snap.scenes,
    automations: snap.automations.map(migrateAutomation).filter((a): a is NonNullable<typeof a> => a != null),
    lastScene: snap.lastScene,
    savedAt: snap.savedAt,
  };
}

function decodeRow(row: HomeRow): { id: string; ownerUserId: string; snap: HomeSnapshot } {
  const key = secretsKeyFromEnv();
  const body = JSON.parse(row.body_json) as Partial<HomeSnapshot>;
  const credentials = decryptJson<HomeSnapshot["credentials"]>(key, row.credentials_enc);
  const base = emptySnapshot();
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    snap: {
      ...base,
      ...body,
      credentials,
      automations: (body.automations ?? []).map(migrateAutomation).filter((a): a is NonNullable<typeof a> => a != null),
      pairPin: row.pair_pin,
    },
  };
}

/**
 * 人が付けた名前と場所を機器へ当て直す。
 *
 * 各社の同期は毎回それぞれの元の名前で機器を差し替えるので、保存の直前に
 * 当て直さないと改名が静かに元へ戻る。結の画面だけでなく Alexa の表示も
 * 元に戻ってしまうため、保存の入口すべてがここを通る。
 */
function withOverrides(snap: HomeSnapshot): HomeSnapshot {
  return { ...snap, devices: applyOverrides(snap.devices, snap.overrides) };
}

function persistRow(id: string, ownerUserId: string, snap: HomeSnapshot) {
  const key = secretsKeyFromEnv();
  const now = new Date().toISOString();
  const has = snap.automations.some((a) => a.enabled) ? 1 : 0;
  getSqlite()
    .prepare(
      `INSERT INTO homes (id, owner_user_id, pair_pin, credentials_enc, body_json, has_enabled_automation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         pair_pin = excluded.pair_pin,
         credentials_enc = excluded.credentials_enc,
         body_json = excluded.body_json,
         has_enabled_automation = excluded.has_enabled_automation,
         updated_at = excluded.updated_at`,
    )
    .run(
      id,
      ownerUserId,
      snap.pairPin,
      encryptJson(key, snap.credentials),
      JSON.stringify(bodyOf(snap)),
      has,
      now,
      now,
    );
}

export function clientHome(snap: HomeSnapshot, host?: string | null) {
  return {
    ...snap,
    credentials: publicCredentials(),
    credentialFlags: credentialFlags(snap.credentials),
    host: host ?? snap.host,
    runner: true,
    // オーデリックは自宅専用のブリッジ越しでしか動かない。未設定の image では
    // 設定画面にカードを出さず、製品にオーデリックの痕跡を残さない。
    odelicBridge: Boolean(process.env.YUI_ODELIC_BRIDGE_URL),
    daikinDirect: daikinConfigured(),
  };
}

export async function ensureHome(ownerUserId: string): Promise<{ id: string; snap: HomeSnapshot }> {
  const db = getSqlite();
  const existing = db.prepare("SELECT * FROM homes WHERE owner_user_id = ?").get(ownerUserId) as HomeRow | undefined;
  if (existing) return decodeRow(existing);

  const imported = await maybeImportLegacy(ownerUserId);
  if (imported) return imported;

  const snap = { ...emptySnapshot(), pairPin: newPin(), devices: [], automations: [] };
  const id = randomUUID();
  persistRow(id, ownerUserId, snap);
  return { id, snap };
}

async function maybeImportLegacy(ownerUserId: string): Promise<{ id: string; snap: HomeSnapshot } | null> {
  const count = getSqlite().prepare("SELECT COUNT(*) AS n FROM homes").get() as { n: number };
  if (count.n > 0) return null;
  const file = process.env.YUI_IMPORT_JSON?.trim() || process.env.YUI_DATA_FILE?.trim();
  if (!file) return null;
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as Partial<HomeSnapshot>;
    const base = emptySnapshot();
    const snap: HomeSnapshot = {
      ...base,
      ...raw,
      credentials: { ...base.credentials, ...raw.credentials },
      automations: (raw.automations ?? []).map(migrateAutomation).filter((a): a is NonNullable<typeof a> => a != null),
      pairPin: raw.pairPin || newPin(),
    };
    const id = randomUUID();
    persistRow(id, ownerUserId, snap);
    return { id, snap };
  } catch {
    return null;
  }
}

export async function loadHome(ownerUserId: string): Promise<{ id: string; snap: HomeSnapshot }> {
  return ensureHome(ownerUserId);
}

export async function saveHome(ownerUserId: string, patch: Partial<HomeSnapshot>): Promise<HomeSnapshot> {
  const cur = await ensureHome(ownerUserId);
  const next: HomeSnapshot = {
    ...cur.snap,
    ...patch,
    credentials: patch.credentials
      ? mergeIncomingCredentials(cur.snap.credentials, patch.credentials)
      : cur.snap.credentials,
    savedAt: new Date().toISOString(),
  };
  const saved = withOverrides(next);
  persistRow(cur.id, ownerUserId, saved);
  return saved;
}

export async function replaceHome(ownerUserId: string, next: HomeSnapshot): Promise<HomeSnapshot> {
  const cur = await ensureHome(ownerUserId);
  const snap: HomeSnapshot = {
    ...next,
    credentials: mergeIncomingCredentials(cur.snap.credentials, next.credentials),
    pairPin: cur.snap.pairPin,
    savedAt: new Date().toISOString(),
  };
  const saved = withOverrides(snap);
  persistRow(cur.id, ownerUserId, saved);
  return saved;
}

export async function loadHomeRecord(homeId: string) {
  const row = getSqlite().prepare("SELECT * FROM homes WHERE id = ?").get(homeId) as HomeRow | undefined;
  return row ? decodeRow(row) : null;
}

export async function saveHomeRecord(homeId: string, patch: Partial<HomeSnapshot>): Promise<HomeSnapshot> {
  const cur = await loadHomeRecord(homeId);
  if (!cur) throw new Error("家が無い");
  const next: HomeSnapshot = {
    ...cur.snap,
    ...patch,
    credentials: patch.credentials
      ? mergeIncomingCredentials(cur.snap.credentials, patch.credentials)
      : cur.snap.credentials,
    savedAt: new Date().toISOString(),
  };
  const saved = withOverrides(next);
  persistRow(homeId, cur.ownerUserId, saved);
  return saved;
}

export function listAutomationHomeIds(): string[] {
  const rows = getSqlite()
    .prepare("SELECT id FROM homes WHERE has_enabled_automation = 1")
    .all() as Array<{ id: string }>;
  return rows.map((row) => row.id);
}
