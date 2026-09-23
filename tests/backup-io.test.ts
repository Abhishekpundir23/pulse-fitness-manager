import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { BACKUP_TABLES, TABLE_COLUMNS, parseBackupArchive, serializeBackup, type BackupArchive } from '../lib/backup-archive';
import { previewArchive } from '../lib/backup-safety';
import { backupRuntime } from './helpers/backup-runtime';

type Runtime = Awaited<ReturnType<typeof backupRuntime>>;
const photoBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);

function fixture(photoUri: string): BackupArchive {
  const created = '2026-09-01 09:00:00';
  return {
    app: 'Pulse Fitness Manager', schemaVersion: 2, exportedAt: '2026-09-20T10:00:00.000Z',
    data: {
      settings: [{ key: 'gym_name', value: 'Original gym' }, { key: 'gym_phone', value: '9876543210' }],
      plans: [{ id: 1, name: 'Owner custom plan', duration_months: 2, amount: 975.5, active: 1 }],
      members: [{ id: 10, membership_id: 'PF-0010', name: 'Asha', gender: 'female', phone: '9876543210', email: null, date_of_birth: null, address: 'Gym lane', notes: 'Evening', photo_uri: photoUri, status: 'active', joined_at: '2026-09-01', created_at: created, updated_at: created }],
      memberships: [{ id: 20, member_id: 10, plan_id: 1, plan_name: 'Purchased plan name', start_date: '2026-09-01', end_date: '2026-11-01', base_amount: 975.5, discount_amount: 75.5, admission_fee: 100, total_amount: 1000, paid_amount: 600, status: 'active', cancelled_at: null, created_at: created }],
      payments: [
        { id: 30, member_id: 10, membership_id: 20, amount: 600, method: 'cash', paid_at: '2026-09-01', note: 'Part payment', created_at: created, voided_at: null, void_reason: null },
        { id: 31, member_id: 10, membership_id: 20, amount: 100, method: 'upi', paid_at: '2026-09-01', note: 'Mistake', created_at: created, voided_at: '2026-09-02T10:00:00.000Z', void_reason: 'Duplicate receipt' },
      ],
      attendance: [{ id: 40, member_id: 10, attendance_date: '2026-09-02', check_in_time: '07:30', created_at: created }],
      expenses: [{ id: 50, title: 'Cleaning', amount: 250.25, expense_date: '2026-09-02', category: 'General', notes: 'Paid cash', created_at: created }],
    },
    memberPhotos: { '10': { data: photoBytes.toString('base64'), extension: 'png' } },
  };
}

async function seed(runtime: Runtime) {
  const photoPath = join(runtime.root, 'document', 'original.png');
  writeFileSync(photoPath, photoBytes);
  const archive = fixture(`file://${photoPath}`);
  for (const table of [...BACKUP_TABLES].reverse()) await runtime.db.execAsync(`DELETE FROM ${table};`);
  for (const table of ['settings', 'plans', 'members', 'memberships', 'payments', 'attendance', 'expenses'] as const) {
    const columns = TABLE_COLUMNS[table];
    for (const row of archive.data[table]) {
      await runtime.db.runAsync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((column) => row[column] as string | number | null));
    }
  }
  return archive;
}

async function snapshot(runtime: Runtime) {
  const entries = await Promise.all(BACKUP_TABLES.map(async (table) => [table, await runtime.db.getAllAsync(`SELECT * FROM ${table} ORDER BY ${table === 'settings' ? 'key' : 'id'}`)]));
  return JSON.parse(JSON.stringify(Object.fromEntries(entries))) as BackupArchive['data'];
}

function withoutPhotoPaths(data: BackupArchive['data']) {
  return { ...data, members: data.members.map((member) => ({ ...member, photo_uri: null })) };
}

async function selectedRestore(runtime: Runtime, archive: BackupArchive) {
  const path = join(runtime.root, 'incoming.json');
  writeFileSync(path, serializeBackup(archive));
  runtime.state.selectedDocument = path;
  return (await runtime.service.chooseBackup())!;
}

test('production backup saves, selects, restores every table and photo, then undoes from its verified recovery file', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  await seed(runtime);
  const original = await snapshot(runtime);
  const prepared = await runtime.service.prepareBackup(runtime.db);
  assert.deepEqual(prepared.archive.memberPhotos?.['10'].data, photoBytes.toString('base64'));
  const savedUri = await runtime.service.savePreparedBackup(prepared);
  assert.deepEqual(parseBackupArchive(readFileSync(runtime.filePath(savedUri), 'utf8')), prepared.archive);
  prepared.file.delete();
  await runtime.db.runAsync("UPDATE settings SET value = 'Current gym' WHERE key = 'gym_name'");
  await runtime.db.runAsync('UPDATE expenses SET amount = 999 WHERE id = 50');
  const beforeRestore = await snapshot(runtime);
  runtime.state.selectedDocument = runtime.filePath(savedUri);
  const selected = (await runtime.service.chooseBackup())!;
  assert.equal(selected.preview.gymName, 'Original gym');
  assert.deepEqual(await snapshot(runtime), beforeRestore, 'preview must not change records');
  const restored = (await runtime.service.applyPreparedRestore(runtime.db, selected, { confirmed: true }))!;
  assert.equal(restored.photoWarning, false);
  assert.deepEqual(withoutPhotoPaths(await snapshot(runtime)), withoutPhotoPaths(original));
  const restoredPhoto = (await snapshot(runtime)).members[0].photo_uri!;
  assert.deepEqual(readFileSync(runtime.filePath(restoredPhoto)), photoBytes);
  const recoveryArchive = parseBackupArchive(readFileSync(runtime.filePath(restored.recovery.uri), 'utf8'));
  assert.deepEqual(recoveryArchive.data, beforeRestore);
  const recoveries = await runtime.service.listRecoveryBackups();
  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].preview?.gymName, 'Current gym');
  const undo = await runtime.service.prepareRecoveryRestore(recoveries[0]);
  await runtime.service.applyPreparedRestore(runtime.db, undo, { confirmed: true });
  assert.deepEqual(withoutPhotoPaths(await snapshot(runtime)), withoutPhotoPaths(beforeRestore));
  assert.deepEqual(readFileSync(runtime.filePath((await snapshot(runtime)).members[0].photo_uri!)), photoBytes);
  assert.equal((await runtime.service.listRecoveryBackups()).length, 2, 'undo must keep both recovery files');
});

test('shared file remains readable by a delayed receiver after prepared-file cleanup', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  await seed(runtime);
  const prepared = await runtime.service.prepareBackup(runtime.db);
  await runtime.service.sharePreparedBackup(prepared);
  prepared.file.delete(); // The settings screen cleans up this temporary preparation file.
  assert.equal(runtime.state.sharedUris.length, 1);
  const delivered = readFileSync(runtime.filePath(runtime.state.sharedUris[0]), 'utf8');
  assert.deepEqual(parseBackupArchive(delivered), prepared.archive);
});

test('corrupt folder write rejects and removes only the incomplete destination', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  await seed(runtime);
  const prepared = await runtime.service.prepareBackup(runtime.db);
  const existing = join(runtime.root, 'external', 'existing-backup.json');
  writeFileSync(existing, 'keep this older copy');
  runtime.state.transformWrite = (path, bytes) => path.includes('/external/') ? Buffer.from('{truncated') : bytes;
  await assert.rejects(() => runtime.service.savePreparedBackup(prepared));
  assert.equal(readFileSync(existing, 'utf8'), 'keep this older copy');
  assert.deepEqual(readdirSync(join(runtime.root, 'external')), ['existing-backup.json']);
  assert.deepEqual(parseBackupArchive(await prepared.file.text()), prepared.archive);
});

test('cancelling either picker leaves all rows and existing backup files untouched', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  await seed(runtime);
  const before = await snapshot(runtime);
  assert.equal(await runtime.service.chooseBackup(), null);
  const prepared = await runtime.service.prepareBackup(runtime.db);
  runtime.state.cancelDirectory = true;
  await assert.rejects(() => runtime.service.savePreparedBackup(prepared), /cancelled/);
  assert.deepEqual(await snapshot(runtime), before);
  assert.equal((await runtime.service.listRecoveryBackups()).length, 0);
  assert.deepEqual(readdirSync(join(runtime.root, 'external')), []);
});

test('full recovery disk prevents replacement and preserves existing records and photo bytes', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  const incoming = await seed(runtime);
  incoming.data.settings[0].value = 'Replacement gym';
  const before = await snapshot(runtime);
  const selected = await selectedRestore(runtime, incoming);
  runtime.state.beforeWrite = (path) => { if (path.includes('/backup-recovery/')) throw new Error('ENOSPC: recovery disk full'); };
  await assert.rejects(() => runtime.service.applyPreparedRestore(runtime.db, selected, { confirmed: true }), /ENOSPC/);
  assert.deepEqual(await snapshot(runtime), before);
  assert.deepEqual(readFileSync(runtime.filePath(before.members[0].photo_uri!)), photoBytes);
  assert.deepEqual(await runtime.db.getAllAsync('PRAGMA foreign_key_check'), []);
});

test('recovery readback detects changed values with identical counts and aborts before deleting records', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  const incoming = await seed(runtime);
  incoming.data.settings[0].value = 'Replacement gym';
  const before = await snapshot(runtime);
  const selected = await selectedRestore(runtime, incoming);
  runtime.state.transformWrite = (path, bytes) => {
    if (!path.includes('/backup-recovery/')) return bytes;
    const changed = parseBackupArchive(bytes.toString('utf8'));
    changed.data.settings.find((row) => row.key === 'gym_name')!.value = 'Silently changed value';
    return Buffer.from(serializeBackup(changed));
  };
  await assert.rejects(() => runtime.service.applyPreparedRestore(runtime.db, selected, { confirmed: true }), /file contents changed/);
  assert.deepEqual(await snapshot(runtime), before);
  assert.deepEqual(readFileSync(runtime.filePath(before.members[0].photo_uri!)), photoBytes);
  assert.equal((await runtime.service.listRecoveryBackups()).length, 1, 'even a failed recovery attempt retains its file for inspection');
});

test('SQLite insertion failure rolls back every table and leaves a readable recovery archive', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  const incoming = await seed(runtime);
  incoming.data.settings[0].value = 'Replacement gym';
  incoming.data.payments[0].id = 99;
  const before = await snapshot(runtime);
  await runtime.db.execAsync("CREATE TRIGGER injected_failure BEFORE INSERT ON payments WHEN NEW.id = 99 BEGIN SELECT RAISE(ABORT, 'injected payment failure'); END;");
  const selected = await selectedRestore(runtime, incoming);
  await assert.rejects(() => runtime.service.applyPreparedRestore(runtime.db, selected, { confirmed: true }), /injected payment failure/);
  assert.deepEqual(await snapshot(runtime), before);
  const recoveries = await runtime.service.listRecoveryBackups();
  assert.equal(recoveries.length, 1);
  assert.deepEqual(parseBackupArchive(readFileSync(runtime.filePath(recoveries[0].uri), 'utf8')).data, before);
  assert.deepEqual(await runtime.db.getAllAsync('PRAGMA foreign_key_check'), []);
});

test('photo write failure reports a warning after records commit and keeps the recovery photo', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  const incoming = await seed(runtime);
  incoming.data.settings[0].value = 'Replacement gym';
  const selected = await selectedRestore(runtime, incoming);
  runtime.state.beforeWrite = (path) => { if (path.includes('/member-photos/restored-')) throw new Error('Photo directory is unwritable'); };
  const restored = (await runtime.service.applyPreparedRestore(runtime.db, selected, { confirmed: true }))!;
  assert.equal(restored.photoWarning, true);
  assert.equal(restored.skippedPhotos, 1);
  const after = await snapshot(runtime);
  assert.equal(after.settings.find((row) => row.key === 'gym_name')?.value, 'Replacement gym');
  assert.equal(after.members[0].photo_uri, null);
  assert.equal(after.payments.length, 2);
  assert.equal(parseBackupArchive(readFileSync(runtime.filePath(restored.recovery.uri), 'utf8')).memberPhotos?.['10'].data, photoBytes.toString('base64'));
  assert.equal(existsSync(join(runtime.root, 'document', 'original.png')), true);
});

test('restore preview reports an unavailable original photo instead of implying a complete photo backup', async (t) => {
  const runtime = await backupRuntime();
  t.after(() => runtime.close());
  await seed(runtime);
  await runtime.db.runAsync("UPDATE members SET photo_uri = 'file:///missing/member-photo.png'");
  const prepared = await runtime.service.prepareBackup(runtime.db);
  assert.equal(previewArchive(prepared.archive).missingPhotos, 1);
  assert.equal(previewArchive(prepared.archive).counts.photos, 0);
});
