import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBackupArchive, serializeBackup, type BackupArchive } from '../lib/backup-archive.ts';
import {
  getBackupAgeReminder, previewArchive, runRestoreWithRecovery, verifyArchiveCopy,
  type RestoreOperations,
} from '../lib/backup-safety.ts';

function archive(gymName: string): BackupArchive {
  return {
    app: 'Pulse Fitness Manager', schemaVersion: 1, exportedAt: '2026-09-20T10:00:00.000Z',
    data: { settings: [{ key: 'gym_name', value: gymName }], plans: [], members: [],
      memberships: [], payments: [], attendance: [], expenses: [] },
  };
}

function storage(options: { corrupt?: boolean; failWrite?: boolean; failReplace?: boolean } = {}) {
  let current = archive('Current gym');
  const files = new Map<string, string>();
  const operations: RestoreOperations = {
    async replaceRows(next, preserveCurrent) {
      await preserveCurrent(current);
      if (options.failReplace) throw new Error('Database insert failed');
      current = next;
    },
    async writeRecovery(serialized) {
      if (options.failWrite) throw new Error('Disk full');
      const uri = `file:///documents/recovery-${files.size}.json`;
      files.set(uri, options.corrupt ? serializeBackup(archive('Wrong gym')) : serialized);
      return { uri, filename: uri.split('/').at(-1)! };
    },
    async readRecovery(copy) { return files.get(copy.uri)!; },
    async restorePhotos() { return 0; },
  };
  return { operations, files, current: () => current };
}

test('preview is read-only and includes gym identity and every record count', () => {
  const input = archive('Northside Gym');
  assert.deepEqual(previewArchive(input), {
    gymName: 'Northside Gym', exportedAt: '2026-09-20T10:00:00.000Z',
    counts: { members: 0, memberships: 0, payments: 0, attendance: 0, expenses: 0, plans: 0, photos: 0 },
  });
  assert.deepEqual(input, archive('Northside Gym'));
});

test('cancelling a preview writes no recovery and leaves the current gym unchanged', async () => {
  const state = storage();
  assert.equal(await runRestoreWithRecovery(archive('Selected gym'), state.operations, false), null);
  assert.equal(state.files.size, 0);
  assert.equal(state.current().data.settings[0].value, 'Current gym');
});

test('confirmed restore preserves and verifies current data before replacing it', async () => {
  const state = storage();
  const result = await runRestoreWithRecovery(archive('Selected gym'), state.operations, true);
  assert.equal(state.current().data.settings[0].value, 'Selected gym');
  assert.equal(parseBackupArchive(state.files.get(result!.recovery.uri)!).data.settings[0].value, 'Current gym');
});

test('same row counts cannot conceal corrupted recovery contents', async () => {
  assert.throws(() => verifyArchiveCopy(serializeBackup(archive('Wrong gym')), archive('Current gym')), /verification/i);
  const state = storage({ corrupt: true });
  await assert.rejects(() => runRestoreWithRecovery(archive('Selected gym'), state.operations, true), /verification/i);
  assert.equal(state.current().data.settings[0].value, 'Current gym');
});

test('recovery write failure aborts restore without replacing current records', async () => {
  const state = storage({ failWrite: true });
  await assert.rejects(() => runRestoreWithRecovery(archive('Selected gym'), state.operations, true), /Disk full/);
  assert.equal(state.current().data.settings[0].value, 'Current gym');
});

test('database failure retains the readable recovery archive', async () => {
  const state = storage({ failReplace: true });
  await assert.rejects(() => runRestoreWithRecovery(archive('Selected gym'), state.operations, true), /Database insert failed/);
  assert.equal(state.current().data.settings[0].value, 'Current gym');
  assert.equal(parseBackupArchive([...state.files.values()][0]).data.settings[0].value, 'Current gym');
});

test('restoring previous data keeps its original safety file and a copy of the data being undone', async () => {
  const state = storage();
  const first = await runRestoreWithRecovery(archive('Selected gym'), state.operations, true);
  const originalCopy = state.files.get(first!.recovery.uri)!;
  await runRestoreWithRecovery(parseBackupArchive(originalCopy), state.operations, true);
  assert.equal(state.current().data.settings[0].value, 'Current gym');
  assert.equal(state.files.get(first!.recovery.uri), originalCopy);
  assert.equal(state.files.size, 2);
  assert.equal(parseBackupArchive([...state.files.values()][1]).data.settings[0].value, 'Selected gym');
});

test('photo failures do not report the committed database restore as failed', async () => {
  const state = storage();
  const selected = archive('Selected gym');
  // An unexpected photo boundary failure is separate from committed record replacement.
  state.operations.restorePhotos = async () => { throw new Error('Photo storage unavailable'); };
  const result = await runRestoreWithRecovery(selected, state.operations, true);
  assert.equal(state.current().data.settings[0].value, 'Selected gym');
  assert.equal(result!.photoWarning, true);
});

test('backup reminder flags missing, old and invalid history but accepts a recent folder export', () => {
  const now = Date.parse('2026-09-22T10:00:00.000Z');
  assert.equal(getBackupAgeReminder('', now).overdue, true);
  assert.equal(getBackupAgeReminder('not-a-date', now).overdue, true);
  assert.equal(getBackupAgeReminder('2026-09-15T10:00:00.000Z', now).overdue, true);
  assert.equal(getBackupAgeReminder('2026-09-21T10:00:00.000Z', now).overdue, false);
  assert.equal(getBackupAgeReminder('2026-10-01T10:00:00.000Z', now).overdue, true);
});
