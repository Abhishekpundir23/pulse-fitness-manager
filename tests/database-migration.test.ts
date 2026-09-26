import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { migrateDbIfNeeded } from '../lib/database.ts';

function execute(dbPath: string, sql: string) {
  return execFileSync('sqlite3', ['-bail', dbPath], {
    encoding: 'utf8',
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function query<T>(dbPath: string, sql: string): T[] {
  const output = execFileSync('sqlite3', ['-json', dbPath], { encoding: 'utf8', input: sql });
  return output.trim() ? JSON.parse(output) as T[] : [];
}

function sqliteAdapter(dbPath: string) {
  return {
    async execAsync(sql: string) {
      execute(dbPath, sql);
    },
    async getFirstAsync<T>(sql: string): Promise<T | null> {
      return query<T>(dbPath, sql)[0] ?? null;
    },
  };
}

test('upgrades representative v2 data to v5 without altering existing records or backup status', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-migration-'));
  const dbPath = join(directory, 'pulse.db');

  try {
    execute(dbPath, `
      CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE plans (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE members (
        id INTEGER PRIMARY KEY,
        membership_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        phone TEXT NOT NULL
      );
      CREATE TABLE memberships (
        id INTEGER PRIMARY KEY,
        member_id INTEGER NOT NULL,
        plan_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE payments (
        id INTEGER PRIMARY KEY,
        member_id INTEGER NOT NULL,
        membership_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        paid_at TEXT NOT NULL
      );
      CREATE INDEX idx_memberships_member ON memberships(member_id);
      CREATE INDEX idx_payments_date ON payments(paid_at);

      INSERT INTO settings(key, value) VALUES
        ('gym_name', 'Pulse Fitness');
      INSERT INTO plans(id, name) VALUES (1, 'Monthly');
      INSERT INTO members(id, membership_id, name, phone) VALUES (10, 'PF-0010', 'Asha', '9999999999');
      INSERT INTO memberships(id, member_id, plan_id, start_date, end_date, total_amount, status)
      VALUES
        (20, 10, 1, '2026-07-01', '2026-08-01', 600, 'active'),
        (21, 10, 1, '2026-05-01', '2026-05-31', 600, 'cancelled');
      INSERT INTO payments(id, member_id, membership_id, amount, method, paid_at)
      VALUES (30, 10, 20, 600, 'cash', '2026-07-01');
      PRAGMA user_version = 2;
    `);

    const recordsBefore = {
      members: query(dbPath, 'SELECT * FROM members ORDER BY id;'),
      memberships: query(dbPath, 'SELECT id, member_id, plan_id, start_date, end_date, total_amount, status FROM memberships ORDER BY id;'),
      payments: query(dbPath, 'SELECT id, member_id, membership_id, amount, method, paid_at FROM payments ORDER BY id;'),
    };
    const db = sqliteAdapter(dbPath);

    await migrateDbIfNeeded(db as never);
    assert.deepEqual(
      query(dbPath, "SELECT key, value FROM settings WHERE key IN ('last_backup_at', 'last_backup_file') ORDER BY key;"),
      [
        { key: 'last_backup_at', value: '' },
        { key: 'last_backup_file', value: '' },
      ],
    );
    execute(dbPath, `
      UPDATE settings SET value = '2026-07-20T10:00:00.000Z' WHERE key = 'last_backup_at';
      UPDATE settings SET value = 'existing-backup.json' WHERE key = 'last_backup_file';
    `);
    await migrateDbIfNeeded(db as never);

    assert.deepEqual({
      members: query(dbPath, 'SELECT * FROM members ORDER BY id;'),
      memberships: query(dbPath, 'SELECT id, member_id, plan_id, start_date, end_date, total_amount, status FROM memberships ORDER BY id;'),
      payments: query(dbPath, 'SELECT id, member_id, membership_id, amount, method, paid_at FROM payments ORDER BY id;'),
    }, recordsBefore);
    assert.deepEqual(
      query(dbPath, "SELECT key, value FROM settings WHERE key IN ('last_backup_at', 'last_backup_file') ORDER BY key;"),
      [
        { key: 'last_backup_at', value: '2026-07-20T10:00:00.000Z' },
        { key: 'last_backup_file', value: 'existing-backup.json' },
      ],
    );
    assert.deepEqual(
      query(dbPath, "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_memberships_start_end', 'idx_payments_method_date') ORDER BY name;"),
      [
        { name: 'idx_memberships_start_end' },
        { name: 'idx_payments_method_date' },
      ],
    );
    assert.deepEqual(query(dbPath, "SELECT name FROM pragma_table_info('memberships') WHERE name = 'cancelled_at';"), [{ name: 'cancelled_at' }]);
    assert.deepEqual(
      query(dbPath, "SELECT cancelled_at FROM memberships WHERE id = 21;"),
      [{ cancelled_at: null }],
    );
    assert.deepEqual(
      query(dbPath, "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'prevent_duplicate_member_phone_%' ORDER BY name;"),
      [
        { name: 'prevent_duplicate_member_phone_insert' },
        { name: 'prevent_duplicate_member_phone_update' },
      ],
    );
    assert.throws(() => execute(dbPath, "INSERT INTO members(id, membership_id, name, phone) VALUES (11, 'PF-0011', 'Other', '9999999999');"), /member with this phone number/);
    assert.deepEqual(query(dbPath, 'SELECT plan_name FROM memberships ORDER BY id;'), [{ plan_name: 'Monthly' }, { plan_name: 'Monthly' }]);
    assert.deepEqual(query(dbPath, 'SELECT voided_at, void_reason FROM payments;'), [{ voided_at: null, void_reason: null }]);
    assert.deepEqual(query(dbPath, 'PRAGMA user_version;'), [{ user_version: 5 }]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
