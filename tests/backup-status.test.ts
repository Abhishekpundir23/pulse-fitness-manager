import assert from 'node:assert/strict';
import test from 'node:test';

import { getBackupStatus, saveBackupStatus } from '../lib/database.ts';

test('returns empty backup status until a folder backup has been saved', async () => {
  const status = await getBackupStatus({
    async getAllAsync() {
      return [];
    },
  } as never);

  assert.deepEqual(status, { exportedAt: '', filename: '' });
});

test('saves both backup status values in one transaction', async () => {
  const entries: [string, string][] = [];
  let transactions = 0;
  const db = {
    async withTransactionAsync(work: () => Promise<void>) {
      transactions += 1;
      await work();
    },
    async runAsync(_sql: string, key: string, value: string) {
      entries.push([key, value]);
    },
  };

  await saveBackupStatus(db as never, '2026-07-21T10:00:00.000Z', 'pulse-backup.json');

  assert.equal(transactions, 1);
  assert.deepEqual(entries, [
    ['last_backup_at', '2026-07-21T10:00:00.000Z'],
    ['last_backup_file', 'pulse-backup.json'],
  ]);
});
