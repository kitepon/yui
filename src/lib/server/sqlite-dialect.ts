import type { DatabaseSync } from "node:sqlite";
import {
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  type TransactionSettings,
  CompiledQuery,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

export function nodeSqliteDialect(getDb: () => DatabaseSync): Dialect {
  return {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new NodeSqliteDriver(getDb),
    createQueryCompiler: (): QueryCompiler => new SqliteQueryCompiler(),
    createIntrospector: (db: Kysely<unknown>): DatabaseIntrospector => new SqliteIntrospector(db),
  };
}

class NodeSqliteDriver implements Driver {
  constructor(private readonly getDb: () => DatabaseSync) {}
  async init() {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return new NodeSqliteConnection(this.getDb());
  }
  async beginTransaction(connection: DatabaseConnection, _settings: TransactionSettings) {
    await connection.executeQuery(CompiledQuery.raw("BEGIN"));
  }
  async commitTransaction(connection: DatabaseConnection) {
    await connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }
  async rollbackTransaction(connection: DatabaseConnection) {
    await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }
  async releaseConnection() {}
  async destroy() {}
}

class NodeSqliteConnection implements DatabaseConnection {
  constructor(private readonly db: DatabaseSync) {}

  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    const sql = compiled.sql.trim();
    const params = (compiled.parameters ?? []) as never[];
    if (!sql) return { rows: [] };
    const stmt = this.db.prepare(compiled.sql);
    const head = sql.slice(0, 6).toUpperCase();
    if (head === "SELECT" || head === "PRAGMA" || head === "WITH " || /\bRETURNING\b/i.test(sql)) {
      return { rows: stmt.all(...params) as R[] };
    }
    const info = stmt.run(...params) as { changes?: number; lastInsertRowid?: number | bigint };
    return {
      rows: [] as R[],
      numAffectedRows: BigInt(info.changes ?? 0),
      insertId: BigInt(info.lastInsertRowid ?? 0),
    };
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("sqlite stream は使わない");
  }
}
