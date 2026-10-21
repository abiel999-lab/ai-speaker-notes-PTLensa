import type { Pool, PoolClient } from "pg";
import type { DatabaseSync } from "node:sqlite";
export interface SqlStep { sql: string; params?: any[] }
export type SqlProgram<T> = Generator<SqlStep, T, any[]>;
export function sqliteStatement(db: DatabaseSync, step: SqlStep) {
  const values: any[] = [];
  const sql = step.sql.replace(/\$(\d+)/g, (_match, number) => {
    values.push((step.params || [])[Number(number) - 1]); return "?";
  });
  return { statement: db.prepare(sql), values };
}
export async function atomicProgram<T>(program: SqlProgram<T>, sqlite?: DatabaseSync, pool?: Pool): Promise<T> {
  if (sqlite) {
    // Entire SQLite transaction is synchronous: no await while the write lock is held.
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      let next = program.next();
      while (!next.done) {
        const { statement, values } = sqliteStatement(sqlite, next.value);
        next = program.next(statement.all(...values));
      }
      sqlite.exec("COMMIT"); return next.value;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }
  const client: PoolClient = await pool!.connect();
  try {
    await client.query("BEGIN");
    let next = program.next();
    while (!next.done) {
      const result = await client.query(next.value.sql, next.value.params || []);
      next = program.next(result.rows);
    }
    await client.query("COMMIT"); return next.value;
  } catch (error) {
    await client.query("ROLLBACK"); throw error;
  } finally { client.release(); }
}
export function* ownerLock(owner: string, postgres: boolean): SqlProgram<void> {
  if (postgres) yield { sql: "SELECT pg_advisory_xact_lock(hashtextextended($1,19))", params: [owner] };
}
