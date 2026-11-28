import type { DatabaseSync } from "node:sqlite";

export type KeyholeRole = "parent" | "child";
export type KeyholeOps = { set: [string, { entry: string; role: KeyholeRole }][]; delete: string[] };

/** The library's KeyholeStore in Yui's SQLite. node:sqlite is synchronous, so each call is one uninterrupted step; write is one transaction. */
export class SqliteKeyholeStore {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  constructor(db: DatabaseSync, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  keyhole(key: string) {
    const row = this.db.prepare("SELECT entry, role FROM keyholes WHERE key = ?").get(key) as
      | { entry: string; role: KeyholeRole }
      | undefined;
    return row && { entry: row.entry, role: row.role };
  }

  keys(entry: string) {
    return this.db.prepare("SELECT key, role FROM keyholes WHERE entry = ?").all(entry) as { key: string; role: KeyholeRole }[];
  }

  /** All of the ops or none: deletes first, then sets. */
  write(ops: KeyholeOps) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const del = this.db.prepare("DELETE FROM keyholes WHERE key = ?");
      for (const k of ops.delete) del.run(k);
      const set = this.db.prepare("INSERT INTO keyholes (key, entry, role) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET entry = excluded.entry, role = excluded.role");
      for (const [k, h] of ops.set) set.run(k, h.entry, h.role);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** true when `id` was unused; it is then kept until `untilMs`. */
  useOnce(id: string, untilMs: number) {
    this.db.prepare("DELETE FROM keyhole_used WHERE until_ms < ?").run(this.now());
    return Number(this.db.prepare("INSERT OR IGNORE INTO keyhole_used (id, until_ms) VALUES (?, ?)").run(id, untilMs).changes) === 1;
  }
}
