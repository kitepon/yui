import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashLegacyAlexaRows } from "./alexa-token-hash.ts";

const globalRef = globalThis as typeof globalThis & {
  __yuiSqlite__?: DatabaseSync;
};

export function sqlitePath() {
  const explicit = process.env.YUI_SQLITE_PATH?.trim();
  if (explicit) return explicit;
  if (existsSync("/data")) return "/data/yui.sqlite";
  return join(process.cwd(), "data/yui.sqlite");
}

export function getSqlite(): DatabaseSync {
  if (globalRef.__yuiSqlite__) return globalRef.__yuiSqlite__;
  const path = sqlitePath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA secure_delete = ON"); // deleted rows are overwritten, not left in free pages (Miranda 2026-11-28)
  applySqliteMigrations(db);
  hashLegacyAlexaRows(db);
  globalRef.__yuiSqlite__ = db;
  return db;
}

export function resetSqliteForTests() {
  if (globalRef.__yuiSqlite__) {
    globalRef.__yuiSqlite__.close();
    globalRef.__yuiSqlite__ = undefined;
  }
}

function applySqliteMigrations(db: DatabaseSync) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  const applied = db.prepare("SELECT name FROM _migrations").all() as Array<{ name: string }>;
  const done = new Set(applied.map((row) => row.name));
  const files = import.meta.glob("../../../migrations/sqlite/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  for (const [path, sql] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const name = path.split("/").pop() as string;
    if (done.has(name)) continue;
    // A table rebuild needs foreign keys off, and that pragma does nothing inside a transaction.
    const fkOff = sql.startsWith("-- yui:foreign-keys-off");
    if (fkOff) db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      if (fkOff && db.prepare("PRAGMA foreign_key_check").all().length) throw new Error(`migration ${name} broke a foreign key`);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(name);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    } finally {
      if (fkOff) db.exec("PRAGMA foreign_keys = ON");
    }
  }
}
