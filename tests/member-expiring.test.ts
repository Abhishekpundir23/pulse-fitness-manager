import assert from 'node:assert/strict';
import test from 'node:test';

import { createMember, createPlan, getMemberDetail, getMembers, getPlans, migrateDbIfNeeded } from '../lib/database.ts';
import { buildMemberSnapshotQuery } from '../lib/member-query.ts';
import type { MemberListItem } from '../lib/types.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

test('expiring members include both seven-day boundaries while excluding future, frozen, cancelled and blocked access', async () => {
  const { db, close } = memoryDatabase();
  try {
    await migrateDbIfNeeded(db);
    await createPlan(db, 'Owner monthly', 1, 1000);
    const plan = (await getPlans(db))[0];
    const cases = [
      ['Ends today', '2026-09-26', 'active', 'active', '2026-09-01'],
      ['Ends in seven', '2026-10-03', 'active', 'active', '2026-09-01'],
      ['Expired yesterday', '2026-09-25', 'active', 'active', '2026-09-01'],
      ['Ends in eight', '2026-10-04', 'active', 'active', '2026-09-01'],
      ['Frozen', '2026-09-29', 'frozen', 'active', '2026-09-01'],
      ['Cancelled', '2026-09-29', 'cancelled', 'active', '2026-09-01'],
      ['Blocked', '2026-09-29', 'active', 'blocked', '2026-09-01'],
      ['Starts tomorrow', '2026-10-02', 'active', 'active', '2026-09-27'],
    ];
    for (const [index, [name, end, status, memberStatus, start]] of cases.entries()) {
      const id = await createMember(db, {
        name, phone: `90000000${String(index).padStart(2, '0')}`, gender: 'Other', planId: plan.id,
        joiningDate: '2026-09-01', discountAmount: 0, admissionFee: 0, initialPayment: 0, paymentMethod: 'Cash',
      });
      await db.runAsync('UPDATE memberships SET start_date = ?, end_date = ?, status = ? WHERE member_id = ?', start, end, status, id);
      await db.runAsync('UPDATE members SET status = ? WHERE id = ?', memberStatus, id);
    }
    const query = buildMemberSnapshotQuery({ search: '', filter: 'expiring', snapshotDate: '2026-09-26', attendanceDate: '2026-09-26', currentView: true });
    const results = await db.getAllAsync<MemberListItem>(query.sql, ...query.args);
    assert.deepEqual(results.map((member) => member.name).sort(), ['Ends in seven', 'Ends today']);
  } finally { close(); }
});

test('historical expiring snapshot preserves older dues and ignores later payments and cancellation', async () => {
  const { db, close } = memoryDatabase();
  try {
    await migrateDbIfNeeded(db);
    await createPlan(db, 'Owner plan', 1, 1000);
    const plan = (await getPlans(db))[0];
    const id = await createMember(db, {
      name: 'Historical renewal', phone: '9000000010', gender: 'Other', planId: plan.id,
      joiningDate: '2026-06-01', discountAmount: 0, admissionFee: 0, initialPayment: 200, paymentMethod: 'Cash',
    });
    const period = (await getMemberDetail(db, id))!.membership_row_id!;
    await db.runAsync("UPDATE memberships SET end_date = '2026-07-05', status = 'cancelled', cancelled_at = '2026-07-03' WHERE id = ?", period);
    await db.runAsync("INSERT INTO payments (member_id, membership_id, amount, method, paid_at) VALUES (?, ?, 800, 'Cash', '2026-07-02')", id, period);
    const results = await getMembers(db, '', 'expiring', '2026-06-30');
    assert.equal(results.length, 1);
    assert.equal(results[0].snapshot_status, 'active');
    assert.equal(results[0].due_amount, 800);
    assert.deepEqual(await getMembers(db, '', 'expiring', '2026-07-03'), []);
  } finally { close(); }
});
