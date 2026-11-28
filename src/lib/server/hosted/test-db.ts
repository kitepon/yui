import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** A throwaway database with every migration applied, as sqlite.ts does (tests only). */
export function testDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../../../../migrations/sqlite/", import.meta.url);
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(new URL(name, dir), "utf8");
    const fkOff = sql.startsWith("-- yui:foreign-keys-off");
    if (fkOff) db.exec("PRAGMA foreign_keys = OFF");
    db.exec(sql);
    if (fkOff) db.exec("PRAGMA foreign_keys = ON");
  }
  return db;
}

export function addUser(db: DatabaseSync, id: string) {
  db.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)').run(id, id, `${id}@x.test`, "2026-01-01", "2026-01-01");
}

export function addHome(db: DatabaseSync, owner: string, id = `h-${owner}`) {
  db.prepare("INSERT INTO homes (id, owner_user_id, pair_pin, credentials_enc, body_json, has_enabled_automation, created_at, updated_at) VALUES (?, ?, '1', 'x', '{}', 0, 'a', 'a')").run(id, owner);
}
