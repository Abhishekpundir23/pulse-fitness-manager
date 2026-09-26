import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Real SQLite, in memory; only adapts Expo's async interface for lifecycle tests. */
export function memoryDatabase() {
  const connection = new DatabaseSync(':memory:');
  const adapter = {
    async execAsync(sql: string) { connection.exec(sql); },
    async getFirstAsync<T>(sql: string, ...args: SQLInputValue[]) {
      return (connection.prepare(sql).get(...args) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: SQLInputValue[]) {
      return connection.prepare(sql).all(...args) as T[];
    },
    async runAsync(sql: string, ...args: SQLInputValue[]) {
      const result = connection.prepare(sql).run(...args);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async withTransactionAsync(task: () => Promise<void>) {
      connection.exec('BEGIN IMMEDIATE');
      try { await task(); connection.exec('COMMIT'); }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
    async withExclusiveTransactionAsync(task: (transaction: SQLiteDatabase) => Promise<void>) {
      await adapter.withTransactionAsync(() => task(adapter as unknown as SQLiteDatabase));
    },
  };
  return { db: adapter as unknown as SQLiteDatabase, close: () => connection.close() };
}

export const createTestDatabase = memoryDatabase;
