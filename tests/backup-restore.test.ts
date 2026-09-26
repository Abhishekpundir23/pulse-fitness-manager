import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  prepareMembersForRestore,
  replaceDatabaseRows,
  restorePhotosIndependently,
  type RestoreTransactionHandle,
} from '../lib/backup-restore.ts';
import { TABLE_COLUMNS, type BackupArchive } from '../lib/backup-archive.ts';

const archive: BackupArchive = {
  app: 'Pulse Fitness Manager',
  schemaVersion: 1,
  exportedAt: '2026-07-21T10:00:00.000Z',
  data: {
    settings: [{ key: 'gym_name', value: 'Pulse Fitness' }],
    plans: [{ id: 1, name: 'Monthly', duration_months: 1, amount: 600, active: 1 }],
    members: [{
      id: 10,
      membership_id: 'PF-0010',
      name: 'Asha',
      gender: 'female',
      phone: '9999999999',
      email: null,
      date_of_birth: null,
      address: null,
      notes: null,
      photo_uri: 'file:///old/photo.jpg',
      status: 'active',
      joined_at: '2026-07-01',
      created_at: '2026-07-01 09:00:00',
      updated_at: '2026-07-01 09:00:00',
    }],
    memberships: [{
      id: 20,
      member_id: 10,
      plan_id: 1,
      start_date: '2026-07-01',
      end_date: '2026-08-01',
      base_amount: 600,
      discount_amount: 0,
      admission_fee: 0,
      total_amount: 600,
      paid_amount: 300,
      status: 'active',
      created_at: '2026-07-01 09:00:00',
    }],
    payments: [{
      id: 30,
      member_id: 10,
      membership_id: 20,
      amount: 300,
      method: 'cash',
      paid_at: '2026-07-01',
      note: null,
      created_at: '2026-07-01 09:00:00',
    }],
    attendance: [{
      id: 40,
      member_id: 10,
      attendance_date: '2026-07-21',
      check_in_time: '07:30',
      created_at: '2026-07-21 07:30:00',
    }],
    expenses: [{
      id: 50,
      title: 'Cleaning',
      amount: 250,
      expense_date: '2026-07-20',
      category: 'General',
      notes: null,
      created_at: '2026-07-20 12:00:00',
    }],
  },
  memberPhotos: {
    '10': { data: 'cGhvdG8=', extension: 'jpg' },
  },
};

type FakeOptions = {
  foreignKeys?: number;
  failSql?: RegExp;
};

function fakeTransaction(options: FakeOptions = {}) {
  const events: string[] = [];
  const runs: { sql: string; values: (string | number | null)[] }[] = [];
  const handle: RestoreTransactionHandle = {
    async execAsync(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(`exec:${normalized}`);
      if (options.failSql?.test(normalized)) throw new Error('injected transaction failure');
    },
    async getFirstAsync() {
      events.push('get:foreign_keys');
      return { foreign_keys: options.foreignKeys ?? 1 };
    },
    async runAsync(sql, values) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      runs.push({ sql: normalized, values: [...values] });
      events.push(`run:${normalized}:${JSON.stringify(values)}`);
      if (options.failSql?.test(normalized)) throw new Error('injected transaction failure');
    },
  };
  return { events, handle, runs };
}

test('prepares every member row with a null photo URI', () => {
  const rows = prepareMembersForRestore(archive.data.members);
  assert.equal(rows[0].photo_uri, null);
  assert.equal(archive.data.members[0].photo_uri, 'file:///old/photo.jpg');
});

test('enables and verifies foreign keys before beginning or mutating', async () => {
  const { events, handle, runs } = fakeTransaction();
  await replaceDatabaseRows(handle, archive);

  assert.deepEqual(events.slice(0, 3), [
    'exec:PRAGMA foreign_keys = ON;',
    'get:foreign_keys',
    'exec:BEGIN IMMEDIATE;',
  ]);
  const dropGuards = events.findIndex((event) => event.includes('DROP TRIGGER IF EXISTS prevent_duplicate_member_phone_insert'));
  const firstMemberInsert = events.findIndex((event) => event.startsWith('run:INSERT INTO members'));
  const createGuards = events.findIndex((event) => event.includes('CREATE TRIGGER IF NOT EXISTS prevent_duplicate_member_phone_insert'));
  assert.ok(dropGuards >= 3);
  assert.ok(firstMemberInsert > dropGuards);
  assert.ok(createGuards > firstMemberInsert);
  assert.deepEqual(
    runs.map(({ sql }) => sql.match(/^INSERT INTO (\w+)/)?.[1]),
    ['settings', 'plans', 'members', 'expenses', 'memberships', 'payments', 'attendance'],
  );
  assert.equal(runs[2].values[9], null);
  assert.equal(events.at(-1), 'exec:COMMIT;');
});

test('restores legacy members with duplicate phones while reinstating duplicate guards', async () => {
  const legacy = structuredClone(archive);
  legacy.data.members.push({
    ...legacy.data.members[0],
    id: 11,
    membership_id: 'PF-0011',
  });
  const { events, handle, runs } = fakeTransaction();

  await replaceDatabaseRows(handle, legacy);

  const memberRows = runs.filter(({ sql }) => /^INSERT INTO members /.test(sql));
  assert.equal(memberRows.length, 2);
  assert.equal(memberRows[0].values[4], memberRows[1].values[4]);
  assert.ok(events.some((event) => event.includes('CREATE TRIGGER IF NOT EXISTS prevent_duplicate_member_phone_update')));
  assert.equal(events.at(-1), 'exec:COMMIT;');
});

test('refuses to mutate when foreign keys cannot be enabled', async () => {
  const { events, handle } = fakeTransaction({ foreignKeys: 0 });
  await assert.rejects(() => replaceDatabaseRows(handle, archive), /foreign keys are disabled/);
  assert.deepEqual(events, ['exec:PRAGMA foreign_keys = ON;', 'get:foreign_keys']);
});

test('rolls back row replacement when any insert fails', async () => {
  const { events, handle } = fakeTransaction({ failSql: /INSERT INTO memberships/ });
  await assert.rejects(() => replaceDatabaseRows(handle, archive), /injected transaction failure/);
  assert.equal(events.at(-1), 'exec:ROLLBACK;');
  assert.equal(events.includes('exec:COMMIT;'), false);
});

test('writes a recovery copy under the transaction lock before deleting any data', async () => {
  const { events, handle } = fakeTransaction();
  await replaceDatabaseRows(handle, archive, async () => { events.push('recovery-verified'); });
  assert.ok(events.indexOf('exec:BEGIN IMMEDIATE;') < events.indexOf('recovery-verified'));
  assert.ok(events.indexOf('recovery-verified') < events.findIndex((event) => event.includes('DELETE FROM')));
});

test('leaves current rows untouched if recovery preparation fails', async () => {
  const { events, handle } = fakeTransaction();
  await assert.rejects(() => replaceDatabaseRows(handle, archive, async () => {
    throw new Error('Recovery disk full');
  }), /Recovery disk full/);
  assert.equal(events.some((event) => event.includes('DELETE FROM')), false);
  assert.equal(events.at(-1), 'exec:ROLLBACK;');
});

test('restores photos independently and counts failures in order', async () => {
  const attempted: string[] = [];
  const photoUris = new Map<string, string | null>([
    ['10', null],
    ['11', null],
    ['12', null],
  ]);
  const photos: [string, { data: string; extension: string }][] = [
    ['10', { data: 'one', extension: 'jpg' }],
    ['11', { data: 'two', extension: 'png' }],
    ['12', { data: 'three', extension: 'webp' }],
  ];
  const skipped = await restorePhotosIndependently(
    photos,
    async ([memberId]) => {
      attempted.push(memberId);
      if (memberId === '11') throw new Error('photo write failed');
      photoUris.set(memberId, `file:///new/${memberId}`);
    },
  );

  assert.deepEqual(attempted, ['10', '11', '12']);
  assert.equal(skipped, 1);
  assert.equal(photoUris.get('10'), 'file:///new/10');
  assert.equal(photoUris.get('11'), null);
  assert.equal(photoUris.get('12'), 'file:///new/12');
});

test('a real SQLite insert failure rolls back all tables and keeps the recovery snapshot intact', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
      sqlite.exec(`CREATE TABLE ${table} (${columns.map((column) => {
        if (column === 'id') return 'id INTEGER PRIMARY KEY';
        if (column === 'key') return 'key TEXT PRIMARY KEY';
        if (column.endsWith('_amount') || ['amount', 'duration_months', 'active', 'member_id', 'plan_id'].includes(column)
          || (table === 'payments' && column === 'membership_id')) return `${column} REAL`;
        return `${column} TEXT`;
      }).join(', ')});`);
    }
    const transaction: RestoreTransactionHandle = {
      async execAsync(sql) { sqlite.exec(sql); },
      async getFirstAsync(sql) { return sqlite.prepare(sql).get() as { foreign_keys: number } | null; },
      async runAsync(sql, values) { return sqlite.prepare(sql).run(...values); },
    };
    await replaceDatabaseRows(transaction, archive);
    sqlite.exec("CREATE TRIGGER reject_bad_payment BEFORE INSERT ON payments WHEN NEW.id = 31 BEGIN SELECT RAISE(ABORT, 'Payment write failed'); END;");
    const incoming = structuredClone(archive);
    incoming.data.settings[0].value = 'Incoming gym';
    incoming.data.payments.push({ ...incoming.data.payments[0], id: 31 });
    let recovery = '';
    await assert.rejects(() => replaceDatabaseRows(transaction, incoming, async () => {
      recovery = JSON.stringify(sqlite.prepare('SELECT * FROM payments').all());
    }), /Payment write failed/);
    assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = 'gym_name'").get()!.value, 'Pulse Fitness');
    assert.deepEqual(sqlite.prepare('SELECT id, amount FROM payments').all().map((row) => ({ ...row })), [{ id: 30, amount: 300 }]);
    assert.deepEqual(JSON.parse(recovery).map((row: { id: number }) => row.id), [30]);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM memberships').get()!.n, 1);
  } finally {
    sqlite.close();
  }
});
