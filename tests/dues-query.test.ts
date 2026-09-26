import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelMembership, createMember, createPlan, getDashboardStats, getMemberDetail,
  getMembers, getPlans, getReportData, migrateDbIfNeeded,
} from '../lib/database.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

test('cancellation removes only the cancelled balance and preserves receipts and earlier historical debt', async () => {
  const { db, close } = memoryDatabase();
  try {
    await migrateDbIfNeeded(db);
    await createPlan(db, 'Monthly', 1, 600.50);
    const plan = (await getPlans(db))[0];
    const memberId = await createMember(db, {
      name: 'Synthetic cancellation', phone: '9000000001', gender: 'Other', planId: plan.id,
      joiningDate: '2000-01-01', discountAmount: 0, admissionFee: 0,
      initialPayment: 300.25, paymentMethod: 'Cash',
    });
    const membershipId = (await getMemberDetail(db, memberId))!.membership_row_id!;
    assert.equal((await getDashboardStats(db)).outstandingDue, 300.25);
    assert.equal((await getReportData(db)).totalDue, 300.25);
    await cancelMembership(db, memberId, membershipId);
    assert.equal((await getDashboardStats(db)).outstandingDue, 0);
    const report = await getReportData(db);
    assert.equal(report.totalDue, 0);
    assert.equal(report.totalCollected, 300.25);
    assert.equal((await getMembers(db, '', 'due')).length, 0);
    assert.equal((await getMembers(db, '', 'due', '2000-01-31'))[0].due_amount, 300.25);
  } finally { close(); }
});
