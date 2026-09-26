import assert from 'node:assert/strict';
import test from 'node:test';

import { createMember, createPlan, getPlans, migrateDbIfNeeded, updateMemberProfile } from '../lib/database.ts';
import type { CreateMemberInput } from '../lib/types.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

test('new profiles and edits cannot duplicate a formatted phone from a legacy backup', async () => {
  const { db, close } = memoryDatabase();
  try {
    await migrateDbIfNeeded(db);
    await createPlan(db, 'Monthly', 1, 600);
    const [plan] = await getPlans(db);
    const input: CreateMemberInput = { name: 'Legacy owner', gender: 'Other', phone: '9876543210', planId: plan.id, joiningDate: '2020-01-01', discountAmount: 0, admissionFee: 0, initialPayment: 0, paymentMethod: 'Cash' };
    const first = await createMember(db, input);
    await db.runAsync('UPDATE members SET phone = ? WHERE id = ?', '+91 98765-43210', first);
    await assert.rejects(createMember(db, { ...input, name: 'Duplicate profile' }), /already|duplicate/i);
    const second = await createMember(db, { ...input, name: 'Another member', phone: '9876543211' });
    await assert.rejects(updateMemberProfile(db, second, { name: 'Another member', gender: 'Other', phone: '0091 9876543210', joinedAt: '2020-01-01' }), /already|duplicate/i);
    const rows = await db.getAllAsync<{ phone: string }>('SELECT phone FROM members ORDER BY id');
    assert.deepEqual(rows.map((row) => row.phone), ['+91 98765-43210', '9876543211']);
  } finally { close(); }
});
