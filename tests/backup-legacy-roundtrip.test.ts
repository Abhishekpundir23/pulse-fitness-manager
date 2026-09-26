import assert from 'node:assert/strict';
import test from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  BACKUP_TABLES, parseBackupArchive, serializeBackup,
  type BackupArchive, type BackupData, type BackupRow,
} from '../lib/backup-archive.ts';
import { replaceDatabaseRows, type RestoreTransactionHandle } from '../lib/backup-restore.ts';
import * as database from '../lib/database.ts';
import { todayIso } from '../lib/format.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

// Column definitions and constraints from release baseline 8da5970, database v4.
// Deliberately independent of the new migration and TABLE_COLUMNS constants.
const LEGACY_SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    duration_months INTEGER NOT NULL, amount REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE members (
    id INTEGER PRIMARY KEY AUTOINCREMENT, membership_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, gender TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
    date_of_birth TEXT, address TEXT, notes TEXT, photo_uri TEXT,
    status TEXT NOT NULL DEFAULT 'active', joined_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    base_amount REAL NOT NULL, discount_amount REAL NOT NULL DEFAULT 0,
    admission_fee REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, cancelled_at TEXT,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL,
    membership_id INTEGER NOT NULL, amount REAL NOT NULL, method TEXT NOT NULL,
    paid_at TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE
  );
  CREATE TABLE attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL, check_in_time TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(member_id, attendance_date),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  );
  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, amount REAL NOT NULL,
    expense_date TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  PRAGMA user_version = 4;
`;

function legacyArchive(): BackupArchive {
  const member = {
    id: 7, membership_id: 'PF-0007', name: 'Synthetic legacy member', gender: 'Other',
    phone: '9000000007', email: null, date_of_birth: '1990-06-01', address: 'Test address',
    notes: 'Preserve हिन्दी and punctuation: "quoted", new\nline',
    photo_uri: 'file:///old-install/member-7.jpg', status: 'active', joined_at: '2025-01-01',
    created_at: '2025-01-01 06:30:00', updated_at: '2025-09-01 10:20:00',
  };
  const membership = {
    id: 21, member_id: 7, plan_id: 3, start_date: '2025-01-01', end_date: '2025-01-31',
    base_amount: 600, discount_amount: 49.75, admission_fee: 100,
    total_amount: 650.25, paid_amount: 300.25, status: 'expired',
    cancelled_at: null, created_at: '2025-01-01 06:30:00',
  };
  const payment = {
    id: 31, member_id: 7, membership_id: 21, amount: 100.1, method: 'Cash',
    paid_at: '2025-01-01', note: 'Initial payment', created_at: '2025-01-01 06:30:00',
  };
  return {
    app: 'Pulse Fitness Manager', schemaVersion: 1, exportedAt: '2026-09-22T12:00:00.000Z',
    data: {
      settings: [
        { key: 'gym_name', value: 'Synthetic daily-use gym' },
        { key: 'owner_name', value: 'Synthetic owner' },
        { key: 'phone', value: '9000000000' },
        { key: 'email', value: '' }, { key: 'address', value: 'Test address' },
        { key: 'last_backup_at', value: '2026-09-20T11:00:00.000Z' },
        { key: 'last_backup_file', value: 'previous-backup.json' },
      ],
      plans: [
        { id: 3, name: 'Old monthly', duration_months: 1, amount: 600, active: 0 },
        { id: 8, name: 'Owner quarterly', duration_months: 3, amount: 1600, active: 1 },
      ],
      members: [
        member,
        // A shared family number could predate the duplicate-phone guards.
        { ...member, id: 10, membership_id: 'PF-0010', name: 'Archived member', status: 'archived', photo_uri: null },
        { ...member, id: 15, membership_id: 'PF-0015', name: 'Future member', phone: '+91 9000000015', photo_uri: null },
      ],
      memberships: [
        membership,
        { ...membership, id: 22, plan_id: 8, start_date: '2025-02-01', end_date: '2025-04-30',
          base_amount: 1600, discount_amount: 0, admission_fee: 0, total_amount: 1600, paid_amount: 1600 },
        { ...membership, id: 28, member_id: 10, status: 'cancelled', total_amount: 650.25,
          paid_amount: 100, cancelled_at: '2025-01-20 10:00:00' },
        { ...membership, id: 29, member_id: 15, plan_id: 8, status: 'active',
          start_date: '2099-01-01', end_date: '2099-03-31', base_amount: 1600,
          discount_amount: 0, admission_fee: 0, total_amount: 1600, paid_amount: 0 },
      ],
      payments: [
        payment,
        { ...payment, id: 35, amount: 200.15, method: 'UPI', paid_at: '2025-01-08', note: null },
        { ...payment, id: 42, membership_id: 22, amount: 1600, method: 'Bank transfer', paid_at: '2025-02-01' },
        { ...payment, id: 49, member_id: 10, membership_id: 28, amount: 100 },
      ],
      attendance: [
        { id: 17, member_id: 7, attendance_date: '2025-01-05', check_in_time: '06:31', created_at: '2025-01-05 06:31:00' },
        { id: 30, member_id: 10, attendance_date: '2025-01-05', check_in_time: '06:33', created_at: '2025-01-05 06:33:00' },
      ],
      expenses: [
        { id: 11, title: 'Cleaning', amount: 351, expense_date: '2025-01-10', category: 'Supplies', notes: null, created_at: '2025-01-10 09:00:00' },
      ],
    },
    memberPhotos: { '7': { data: 'c3ludGhldGljLXBob3Rv', extension: 'jpg' } },
  };
}

function transaction(db: SQLiteDatabase): RestoreTransactionHandle {
  return {
    execAsync: (sql) => db.execAsync(sql),
    getFirstAsync: (sql) => db.getFirstAsync(sql),
    runAsync: (sql, values) => db.runAsync(sql, ...values),
  };
}

async function readData(db: SQLiteDatabase) {
  const data = {} as Record<string, BackupRow[]>;
  for (const table of BACKUP_TABLES) {
    data[table] = (await db.getAllAsync<BackupRow>(
      `SELECT * FROM ${table} ORDER BY ${table === 'settings' ? 'key' : 'id'}`,
    )).map((row) => ({ ...row }));
  }
  return data as BackupData;
}

function sortedData(archive: BackupArchive) {
  const data = structuredClone(archive.data);
  for (const table of BACKUP_TABLES) {
    const key = table === 'settings' ? 'key' : 'id';
    data[table].sort((a, b) => typeof a[key] === 'number'
      ? Number(a[key]) - Number(b[key]) : String(a[key]).localeCompare(String(b[key])));
  }
  return data;
}

test('release v1 archive restores all tables and legacy balances into a fresh v5 database', async () => {
  const { db, close } = memoryDatabase();
  try {
    await database.migrateDbIfNeeded(db);
    const original = legacyArchive();
    const archive = parseBackupArchive(JSON.stringify(original));
    await replaceDatabaseRows(transaction(db), archive);

    const expected = sortedData(archive);
    expected.members.forEach((member) => { member.photo_uri = null; });
    assert.deepEqual(await readData(db), expected);
    assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal((await database.getMemberDetail(db, 7))!.lifetime_due_amount, 350);
    assert.equal((await db.getFirstAsync<{ cancelled_at: string }>(
      'SELECT cancelled_at FROM memberships WHERE id = 28',
    ))?.cancelled_at, '2025-01-20 10:00:00');
    assert.equal((await database.getReportData(db)).totalCollected, 2000.25);
    assert.equal((await database.getReportData(db)).totalDue, 1950);
    assert.deepEqual(parseBackupArchive(serializeBackup(archive)).memberPhotos, original.memberPhotos);
    assert.equal('plan_name' in original.data.memberships[0], false);
  } finally { close(); }
});

test('upgrading a populated release v4 database preserves every old field before export and restore', async () => {
  const source = memoryDatabase();
  const target = memoryDatabase();
  try {
    await source.db.execAsync(LEGACY_SCHEMA);
    const original = legacyArchive();
    for (const table of BACKUP_TABLES) {
      for (const row of original.data[table]) {
        const columns = Object.keys(row);
        await source.db.runAsync(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          ...columns.map((column) => row[column] as string | number | null),
        );
      }
    }
    const before = await readData(source.db);
    await database.migrateDbIfNeeded(source.db);
    const upgraded = await readData(source.db);
    for (const table of BACKUP_TABLES) {
      for (const [index, row] of before[table].entries()) {
        for (const [key, value] of Object.entries(row)) assert.equal(upgraded[table][index][key], value);
      }
    }
    assert.equal((await source.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version, 5);

    const archive = parseBackupArchive(serializeBackup({ ...original, schemaVersion: 2, data: upgraded }));
    await database.migrateDbIfNeeded(target.db);
    await replaceDatabaseRows(transaction(target.db), archive);
    const expected = sortedData(archive);
    expected.members.forEach((member) => { member.photo_uri = null; });
    assert.deepEqual(await readData(target.db), expected);
  } finally { source.close(); target.close(); }
});

test('a restored gym can collect old dues and add members without reassigning prior history', async () => {
  const { db, close } = memoryDatabase();
  try {
    await database.migrateDbIfNeeded(db);
    const archive = parseBackupArchive(JSON.stringify(legacyArchive()));
    await replaceDatabaseRows(transaction(db), archive);
    await database.addPayment(db, 7, 21, 350, 'Cash', todayIso(), 'Old balance settled after restore');
    assert.equal((await database.getMemberDetail(db, 7))!.lifetime_due_amount, 0);
    assert.equal((await database.getMemberDetail(db, 10))!.payments.length, 1);
    const id = await database.createMember(db, {
      name: 'Added after restore', gender: 'Other', phone: '9000000088', planId: 8,
      joiningDate: todayIso(), initialPayment: 500, paymentMethod: 'UPI',
      discountAmount: 0, admissionFee: 0,
    });
    assert.ok(id > 15);
    assert.equal((await database.getMemberDetail(db, id))!.paid_amount, 500);
    assert.equal((await database.getMemberDetail(db, 7))!.memberships.length, 2);
    assert.equal((await database.getReportData(db)).totalCollected, 2850.25);
    assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
    await assert.rejects(database.createMember(db, {
      name: 'Duplicate phone rejected', gender: 'Other', phone: '9000000007', planId: 8,
      joiningDate: todayIso(), initialPayment: 0, paymentMethod: 'Cash',
      discountAmount: 0, admissionFee: 0,
    }), /number is already used/i);
  } finally { close(); }
});

test('a full-schema restore failure preserves every current table and the captured recovery data', async () => {
  const { db, close } = memoryDatabase();
  try {
    await database.migrateDbIfNeeded(db);
    const archive = parseBackupArchive(JSON.stringify(legacyArchive()));
    await replaceDatabaseRows(transaction(db), archive);
    const before = await readData(db);
    await db.execAsync(`CREATE TRIGGER reject_incoming_expense BEFORE INSERT ON expenses
      WHEN NEW.title = 'Injected failure' BEGIN SELECT RAISE(ABORT, 'Injected expense failure'); END;`);
    const incoming = structuredClone(archive);
    incoming.data.settings.find((setting) => setting.key === 'gym_name')!.value = 'Incoming gym';
    incoming.data.expenses[0].title = 'Injected failure';
    let recovery: BackupData | undefined;
    await assert.rejects(replaceDatabaseRows(transaction(db), incoming, async () => {
      recovery = await readData(db);
    }), /Injected expense failure/);
    assert.deepEqual(await readData(db), before);
    assert.deepEqual(recovery, before);
    assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
  } finally { close(); }
});
