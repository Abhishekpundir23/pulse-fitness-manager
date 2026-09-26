import assert from 'node:assert/strict';
import test from 'node:test';

import { sortDirectoryMembers } from '../lib/member-query.ts';

const members = [
  { id: 3, name: 'Zoya', due_amount: 25, end_date: null },
  { id: 2, name: 'Asha', due_amount: 400, end_date: '2026-10-03' },
  { id: 1, name: 'Bina', due_amount: 800, end_date: '2026-09-26' },
];

test('directory sorting orders renewal and collection work without changing the input or recent order', () => {
  assert.deepEqual(sortDirectoryMembers(members, 'expiry').map((member) => member.id), [1, 2, 3]);
  assert.deepEqual(sortDirectoryMembers(members, 'due').map((member) => member.id), [1, 2, 3]);
  assert.deepEqual(sortDirectoryMembers(members, 'name').map((member) => member.id), [2, 1, 3]);
  assert.deepEqual(sortDirectoryMembers(members, 'recent').map((member) => member.id), [3, 2, 1]);
  assert.deepEqual(members.map((member) => member.id), [3, 2, 1]);
});
