import assert from 'node:assert/strict';
import test from 'node:test';

import { getBackupDataHealth } from '../lib/database.ts';

test('reports legacy duplicate phone groups without changing member records', async () => {
  let query = '';
  const health = await getBackupDataHealth({
    async getFirstAsync(sql: string) {
      query = sql;
      return { duplicate_phone_groups: 2, duplicate_phone_members: 5 };
    },
  } as never);

  assert.match(query, /GROUP BY phone/);
  assert.match(query, /HAVING COUNT\(\*\) > 1/);
  assert.deepEqual(health, { duplicatePhoneGroups: 2, duplicatePhoneMembers: 5 });
});

test('returns a clean result when there are no duplicate phone groups', async () => {
  const health = await getBackupDataHealth({
    async getFirstAsync() {
      return { duplicate_phone_groups: 0, duplicate_phone_members: null };
    },
  } as never);

  assert.deepEqual(health, { duplicatePhoneGroups: 0, duplicatePhoneMembers: 0 });
});
