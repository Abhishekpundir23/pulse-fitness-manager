import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildMemberSnapshotQuery } from '../lib/member-query.ts';

function bindSql(sql: string, args: (string | number)[]) {
  let index = 0;
  const bound = sql.replace(/\?/g, () => {
    const value = args[index++];
    return typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
  });
  assert.equal(index, args.length);
  return bound;
}

test('selects the latest membership that existed by the snapshot date', () => {
  const query = buildMemberSnapshotQuery({
    search: 'Asha',
    filter: 'all',
    snapshotDate: '2026-06-30',
    attendanceDate: '2026-07-21',
  });
  assert.match(query.sql, /ms\.start_date <= \(SELECT snapshot_date FROM snapshot\)/);
  assert.match(query.sql, /ORDER BY ms\.start_date DESC, ms\.id DESC/);
  assert.deepEqual(query.args.slice(0, 2), ['2026-06-30', '2026-07-21']);
  assert.equal(query.args.at(-1), '%Asha%');
});

test('active and expired filters compare membership dates to the snapshot', () => {
  assert.match(buildMemberSnapshotQuery({ search: '', filter: 'active', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql, /ms\.end_date >= \(SELECT snapshot_date FROM snapshot\)/);
  assert.match(buildMemberSnapshotQuery({ search: '', filter: 'expired', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql, /ms\.end_date < \(SELECT snapshot_date FROM snapshot\)/);
});

test('binds active-filter placeholders in complete SQL order', () => {
  const query = buildMemberSnapshotQuery({
    search: 'Asha',
    filter: 'active',
    snapshotDate: '2026-06-30',
    attendanceDate: '2026-07-21',
  });
  assert.deepEqual(query.args, [
    '2026-06-30',
    '2026-07-21',
    '%Asha%',
    '%Asha%',
    '%Asha%',
  ]);
});

test('pending excludes cancelled memberships and paid accepts a zero balance', () => {
  const due = buildMemberSnapshotQuery({ search: '', filter: 'due', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql;
  const paid = buildMemberSnapshotQuery({ search: '', filter: 'paid', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql;
  assert.match(due, /ms\.cancelled_at IS NULL OR ms\.cancelled_at <=/);
  assert.match(due, /total_amount.*sp\.paid_amount/);
  assert.match(paid, /= 0/);
});

test('cancelled filter only returns cancelled snapshot memberships', () => {
  const sql = buildMemberSnapshotQuery({ search: '', filter: 'cancelled', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql;
  assert.match(sql, /ms\.status = 'cancelled'/);
  assert.match(sql, /ms\.cancelled_at <= \(SELECT snapshot_date FROM snapshot\)/);
});

test('uses payments and member existence only through the snapshot date', () => {
  const sql = buildMemberSnapshotQuery({ search: '', filter: 'all', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql;
  assert.match(sql, /WHERE paid_at <= \(SELECT snapshot_date FROM snapshot\)/);
  assert.match(sql, /COALESCE\(sp\.paid_amount, 0\) AS paid_amount/);
  assert.match(sql, /m\.joined_at <= \(SELECT snapshot_date FROM snapshot\)/);
  assert.doesNotMatch(sql, /COALESCE\(ms\.paid_amount, 0\) AS paid_amount/);
});

test('executes historical payment, cancellation, and join-date semantics in SQLite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-member-query-'));
  const dbPath = join(directory, 'pulse.db');
  try {
    execFileSync('sqlite3', ['-bail', dbPath], {
      input: `
        CREATE TABLE plans (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE members (
          id INTEGER PRIMARY KEY, membership_id TEXT, name TEXT, gender TEXT, phone TEXT,
          photo_uri TEXT, status TEXT, joined_at TEXT, created_at TEXT
        );
        CREATE TABLE memberships (
          id INTEGER PRIMARY KEY, member_id INTEGER, plan_id INTEGER, start_date TEXT,
          end_date TEXT, total_amount REAL, paid_amount REAL, status TEXT, cancelled_at TEXT
        );
        CREATE TABLE payments (id INTEGER PRIMARY KEY, membership_id INTEGER, amount REAL, paid_at TEXT);
        CREATE TABLE attendance (id INTEGER PRIMARY KEY, member_id INTEGER, attendance_date TEXT);
        INSERT INTO plans VALUES (1, 'Monthly');
        INSERT INTO members VALUES
          (10, 'PF-0010', 'Asha', 'Female', '9999999999', NULL, 'active', '2026-05-01', '2026-05-01'),
          (11, 'PF-0011', 'Future', 'Male', '8888888888', NULL, 'active', '2026-07-01', '2026-07-01');
        INSERT INTO memberships VALUES
          (20, 10, 1, '2026-06-01', '2026-07-31', 600, 600, 'cancelled', '2026-07-10');
        INSERT INTO payments VALUES
          (30, 20, 300, '2026-06-01'),
          (31, 20, 300, '2026-07-05');
      `,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const juneQuery = buildMemberSnapshotQuery({
      search: '',
      filter: 'all',
      snapshotDate: '2026-06-30',
      attendanceDate: '2026-07-21',
    });
    const june = JSON.parse(execFileSync('sqlite3', ['-json', dbPath], {
      input: bindSql(juneQuery.sql, juneQuery.args),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })) as { name: string; paid_amount: number; due_amount: number; snapshot_status: string }[];
    assert.deepEqual(june.map(({ name, paid_amount, due_amount, snapshot_status }) => ({
      name,
      paid_amount,
      due_amount,
      snapshot_status,
    })), [{ name: 'Asha', paid_amount: 300, due_amount: 300, snapshot_status: 'active' }]);

    const julyQuery = buildMemberSnapshotQuery({
      search: '',
      filter: 'cancelled',
      snapshotDate: '2026-07-31',
      attendanceDate: '2026-07-21',
    });
    const july = JSON.parse(execFileSync('sqlite3', ['-json', dbPath], {
      input: bindSql(julyQuery.sql, julyQuery.args),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })) as { name: string; paid_amount: number; due_amount: number; snapshot_status: string }[];
    assert.deepEqual(july.map(({ name, paid_amount, due_amount, snapshot_status }) => ({
      name,
      paid_amount,
      due_amount,
      snapshot_status,
    })), [{ name: 'Asha', paid_amount: 600, due_amount: 0, snapshot_status: 'cancelled' }]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
