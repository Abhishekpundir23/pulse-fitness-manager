import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDbIfNeeded } from '../../lib/database';

type BackupService = typeof import('../../lib/backup');
type Location = string | { uri: string };

/** Runs the production orchestration with real disk files and SQLite connections.
 * Only the unavailable native bridges (pickers, sharing, filesystem API shape)
 * are substituted. This does not emulate Android SAF permissions or activities.
 */
export async function backupRuntime() {
  const root = mkdtempSync(join(tmpdir(), 'pulse-backup-'));
  const connections = new Set<DatabaseSync>();
  const state = {
    selectedDocument: null as string | null,
    cancelDirectory: false,
    sharedUris: [] as string[],
    beforeWrite: undefined as ((path: string) => void) | undefined,
    transformWrite: undefined as ((path: string, data: Buffer) => Buffer) | undefined,
  };
  function location(...parts: Location[]) {
    return join(...parts.map((part) => {
      const value = typeof part === 'string' ? part : part.uri;
      return value.startsWith('file:') ? fileURLToPath(value) : value;
    }));
  }
  class DiskFile {
    readonly path: string;
    constructor(...parts: Location[]) { this.path = location(...parts); }
    get uri() { return pathToFileURL(this.path).href; }
    get exists() { return existsSync(this.path) && statSync(this.path).isFile(); }
    get name() { return this.path.split('/').at(-1)!; }
    get size() { return statSync(this.path).size; }
    create(options: { overwrite?: boolean } = {}) {
      state.beforeWrite?.(this.path);
      writeFileSync(this.path, '', { flag: options.overwrite ? 'w' : 'wx' });
    }
    write(value: string | Uint8Array, options: { encoding?: string } = {}) {
      state.beforeWrite?.(this.path);
      const bytes = typeof value === 'string' ? Buffer.from(value, options.encoding === 'base64' ? 'base64' : 'utf8') : Buffer.from(value);
      writeFileSync(this.path, state.transformWrite?.(this.path, bytes) ?? bytes);
    }
    async text() { return readFileSync(this.path, 'utf8'); }
    async base64() { return readFileSync(this.path).toString('base64'); }
    copy(destination: DiskFile | DiskDirectory) {
      const target = destination instanceof DiskDirectory ? join(destination.path, this.name) : destination.path;
      state.beforeWrite?.(target);
      copyFileSync(this.path, target);
    }
    delete() { rmSync(this.path); }
  }
  class DiskDirectory {
    readonly path: string;
    constructor(...parts: Location[]) { this.path = location(...parts); }
    get uri() { return pathToFileURL(this.path).href; }
    get exists() { return existsSync(this.path) && statSync(this.path).isDirectory(); }
    create(options: { intermediates?: boolean; idempotent?: boolean } = {}) {
      mkdirSync(this.path, { recursive: options.intermediates || options.idempotent });
    }
    createFile(name: string) { const file = new DiskFile(this, name); file.create(); return file; }
    list() {
      return readdirSync(this.path).map((name) => statSync(join(this.path, name)).isDirectory()
        ? new DiskDirectory(this, name) : new DiskFile(this, name));
    }
    static async pickDirectoryAsync() {
      if (state.cancelDirectory) throw new Error('Directory selection cancelled');
      return new DiskDirectory(root, 'external');
    }
  }
  for (const name of ['cache', 'document', 'external']) mkdirSync(join(root, name));
  function connect(path: string) {
    const connection = new DatabaseSync(path);
    connections.add(connection);
    const bind = (values: (SQLInputValue | SQLInputValue[])[]) => values.flat();
    const adapter = {
      databasePath: path,
      options: {},
      async execAsync(sql: string) { connection.exec(sql); },
      async getFirstAsync<T>(sql: string, ...values: (SQLInputValue | SQLInputValue[])[]) {
        return connection.prepare(sql).get(...bind(values)) as T | undefined ?? null;
      },
      async getAllAsync<T>(sql: string, ...values: (SQLInputValue | SQLInputValue[])[]) {
        return connection.prepare(sql).all(...bind(values)) as T[];
      },
      async runAsync(sql: string, ...values: (SQLInputValue | SQLInputValue[])[]) {
        const result = connection.prepare(sql).run(...bind(values));
        return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
      },
      async closeAsync() { connection.close(); connections.delete(connection); },
      async withTransactionAsync(work: () => Promise<void>) {
        connection.exec('BEGIN IMMEDIATE');
        try { await work(); connection.exec('COMMIT'); }
        catch (error) { connection.exec('ROLLBACK'); throw error; }
      },
      async withExclusiveTransactionAsync(work: (db: SQLiteDatabase) => Promise<void>) {
        await adapter.withTransactionAsync(() => work(adapter as unknown as SQLiteDatabase));
      },
    };
    return adapter as unknown as SQLiteDatabase;
  }
  const db = connect(join(root, 'gym.db'));
  await migrateDbIfNeeded(db);
  const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../lib/backup.ts');
  const sourceRequire = createRequire(sourcePath);
  const modules: Record<string, unknown> = {
    'expo-file-system': {
      File: DiskFile, Directory: DiskDirectory,
      Paths: { cache: new DiskDirectory(root, 'cache'), document: new DiskDirectory(root, 'document') },
    },
    'expo-document-picker': {
      async getDocumentAsync() {
        return state.selectedDocument ? { canceled: false, assets: [{ uri: pathToFileURL(state.selectedDocument).href, name: 'selected-backup.json' }] } : { canceled: true };
      },
    },
    'expo-sharing': {
      async isAvailableAsync() { return true; },
      async shareAsync(uri: string) { state.sharedUris.push(uri); },
    },
    'expo-sqlite': {
      async openDatabaseAsync(name: string, _options: unknown, directory: string) { return connect(join(directory, name)); },
    },
    'react-native': { Alert: { alert() { throw new Error('Unexpected confirmation dialog in integration test'); } } },
  };
  const output = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const service = {} as BackupService;
  // Loading this one entry point lets its normal pure dependencies run unchanged.
  new Function('require', 'exports', output)((name: string) => {
    if (name in modules) return modules[name];
    return sourceRequire(name.startsWith('@/') ? resolve(dirname(sourcePath), '..', name.slice(2)) : name);
  }, service);
  return {
    root, db, service, state,
    filePath: (uri: string) => fileURLToPath(uri),
    async close() {
      for (const connection of connections) connection.close();
      connections.clear();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
