import { decryptJson, encryptJson, secretsKeyFromEnv } from "./home-secrets.ts";
import { getSqlite } from "./sqlite.ts";

export const BACKUP_VERSION = 2;
const LATEST_KEY = "yuihome/latest.enc";

type Row = Record<string, unknown>;

export type HomeDump = {
  version: 1 | typeof BACKUP_VERSION;
  takenAt: string;
  user: Row[];
  account: Row[];
  homes: Row[];
  billing_customers?: Row[];
  apple_billing_accounts?: Row[];
  apple_subscriptions?: Row[];
  apple_notification_events?: Row[];
};

type Table = "user" | "account" | "homes" | "billing_customers" |
  "apple_billing_accounts" | "apple_subscriptions" | "apple_notification_events";

export function backupConfigured() {
  return Boolean(process.env.YUI_BACKUP_URL?.trim() && process.env.YUI_BACKUP_SECRET?.trim());
}

function tableRows(
  sqlite: ReturnType<typeof getSqlite>,
  table: Table,
): Row[] {
  return sqlite.prepare(`SELECT * FROM "${table}"`).all() as Row[];
}

export function dumpHomeDb(sqlite = getSqlite()): HomeDump {
  return {
    version: BACKUP_VERSION,
    takenAt: new Date().toISOString(),
    user: tableRows(sqlite, "user"),
    account: tableRows(sqlite, "account"),
    homes: tableRows(sqlite, "homes"),
    billing_customers: tableRows(sqlite, "billing_customers"),
    apple_billing_accounts: tableRows(sqlite, "apple_billing_accounts"),
    apple_subscriptions: tableRows(sqlite, "apple_subscriptions"),
    apple_notification_events: tableRows(sqlite, "apple_notification_events"),
  };
}

function insertRows(
  sqlite: ReturnType<typeof getSqlite>,
  table: Table,
  rows: Row[],
) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const quoted = cols.map((col) => `"${col}"`).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  const stmt = sqlite.prepare(`INSERT INTO "${table}" (${quoted}) VALUES (${placeholders})`);
  for (const row of rows) {
    stmt.run(...cols.map((col) => row[col] as string | number | bigint | null));
  }
}

export function applyHomeDump(dump: HomeDump, sqlite = getSqlite()) {
  if (dump.version !== 1 && dump.version !== BACKUP_VERSION) {
    throw new Error(`未対応のバックアップ版 ${String(dump.version)}`);
  }
  sqlite.exec("BEGIN");
  try {
    sqlite.exec(`DELETE FROM "session"`);
    sqlite.exec(`DELETE FROM "verification"`);
    sqlite.exec(`DELETE FROM "account"`);
    sqlite.exec(`DELETE FROM "billing_customers"`);
    sqlite.exec(`DELETE FROM "apple_notification_events"`);
    sqlite.exec(`DELETE FROM "apple_subscriptions"`);
    sqlite.exec(`DELETE FROM "apple_billing_accounts"`);
    sqlite.exec(`DELETE FROM "homes"`);
    sqlite.exec(`DELETE FROM "user"`);
    insertRows(sqlite, "user", dump.user);
    insertRows(sqlite, "account", dump.account);
    insertRows(sqlite, "homes", dump.homes);
    insertRows(sqlite, "billing_customers", dump.billing_customers ?? []);
    insertRows(sqlite, "apple_billing_accounts", dump.apple_billing_accounts ?? []);
    insertRows(sqlite, "apple_subscriptions", dump.apple_subscriptions ?? []);
    insertRows(sqlite, "apple_notification_events", dump.apple_notification_events ?? []);
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

function backupUrl(key: string) {
  const base = process.env.YUI_BACKUP_URL?.trim();
  if (!base) throw new Error("YUI_BACKUP_URL が無い");
  return `${base.replace(/\/+$/, "")}/${key}`;
}

function backupHeaders() {
  const secret = process.env.YUI_BACKUP_SECRET?.trim();
  if (!secret) throw new Error("YUI_BACKUP_SECRET が無い");
  return { authorization: `Bearer ${secret}` };
}

export function packDump(dump: HomeDump) {
  return encryptJson(secretsKeyFromEnv(), dump);
}

export function unpackDump(packed: string): HomeDump {
  const dump = decryptJson<HomeDump>(secretsKeyFromEnv(), packed);
  if ((dump.version !== 1 && dump.version !== BACKUP_VERSION) || !Array.isArray(dump.user) || !Array.isArray(dump.homes)) {
    throw new Error("バックアップの中身が読めない");
  }
  return dump;
}

export async function pushBackup() {
  if (!backupConfigured()) throw new Error("バックアップ先が無い");
  const dump = dumpHomeDb();
  const packed = packDump(dump);
  const body = new TextEncoder().encode(packed);
  const day = new Date().toISOString().slice(0, 10);
  const keys = [LATEST_KEY, `yuihome/${day}.enc`];
  for (const key of keys) {
    const res = await fetch(backupUrl(key), {
      method: "PUT",
      headers: { ...backupHeaders(), "content-type": "application/octet-stream" },
      body,
    });
    if (!res.ok) {
      throw new Error(`バックアップ送信に失敗 ${key} ${res.status} ${await res.text()}`);
    }
  }
  return { keys, takenAt: dump.takenAt, users: dump.user.length, homes: dump.homes.length };
}

export async function pullLatestDump(): Promise<HomeDump> {
  if (!backupConfigured()) throw new Error("バックアップ先が無い");
  const res = await fetch(backupUrl(LATEST_KEY), { headers: backupHeaders() });
  if (!res.ok) throw new Error(`バックアップ取得に失敗 ${res.status} ${await res.text()}`);
  return unpackDump(await res.text());
}

export async function restoreLatest() {
  applyHomeDump(await pullLatestDump());
}

let started = false;

export function startBackupRunner() {
  if (started) return;
  started = true;
  if (!backupConfigured()) {
    console.warn("[yui] backup skipped: YUI_BACKUP_URL / YUI_BACKUP_SECRET が無い");
    return;
  }
  const interval = Number(process.env.YUI_BACKUP_INTERVAL_MS ?? 60 * 60 * 1000);
  const kick = () => {
    void pushBackup()
      .then((info) => console.info("[yui] backup ok", info.takenAt, "homes", info.homes))
      .catch((err) => console.error("[yui] backup failed", err));
  };
  setTimeout(kick, 15_000);
  setInterval(kick, Number.isFinite(interval) && interval > 0 ? interval : 60 * 60 * 1000);
}
