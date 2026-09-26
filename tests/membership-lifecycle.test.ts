import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../lib/database.ts';
import { todayIso } from '../lib/format.ts';
import type { CreateMemberInput, PaymentMethod } from '../lib/types.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

async function fixture() {
  const state = memoryDatabase();
  await database.migrateDbIfNeeded(state.db);
  // Use an owner-created plan so this fixture works before and after seed removal.
  await database.createPlan(state.db, 'Owner monthly', 1, 600);
  const plan = (await database.getPlans(state.db)).find((item) => item.name === 'Owner monthly')!;
  const input: CreateMemberInput = {
    name: 'Synthetic member', gender: 'Other', phone: '9000000001', planId: plan.id,
    joiningDate: '2000-01-01', discountAmount: 0, admissionFee: 0,
    initialPayment: 300, paymentMethod: 'Cash',
  };
  return { ...state, plan, input };
}

test('mobile normalization accepts Indian prefixes but rejects misplaced signs and other country codes', () => {
  assert.equal(database.normalizeMemberPhone('+91 90000-00001'), '9000000001');
  assert.equal(database.normalizeMemberPhone('0091 (90000) 00001'), '9000000001');
  for (const value of ['90+00000001', '+1 9000000001', 'phone9000000001', '123', '5000000001']) {
    assert.throws(() => database.normalizeMemberPhone(value), /mobile/i);
  }
});

test('renewal retains collectible earlier dues and reconciles member, list and financial totals', async () => {
  const { db, close, input, plan } = await fixture();
  try {
    const id = await database.createMember(db, input);
    const old = (await database.getMemberDetail(db, id))!;
    await database.createMembership(db, { ...input, memberId: id, planId: plan.id, joiningDate: todayIso(), initialPayment: 600 });
    let detail = (await database.getMemberDetail(db, id))!;
    assert.equal(detail.due_amount, 0);
    assert.equal(detail.lifetime_due_amount, 300);
    assert.equal(detail.memberships.length, 2);
    assert.equal(detail.memberships.find((item) => item.id === old.membership_row_id)?.due_amount, 300);
    assert.equal((await database.getMembers(db, '', 'due'))[0]?.due_amount, 300);
    assert.equal((await database.getMembers(db, '', 'paid')).length, 0);
    assert.equal((await database.getDashboardStats(db)).outstandingDue, 300);
    assert.equal((await database.getReportData(db)).totalDue, 300);
    await database.addPayment(db, id, old.membership_row_id!, 300, 'UPI', todayIso());
    detail = (await database.getMemberDetail(db, id))!;
    assert.equal(detail.lifetime_due_amount, 0);
    assert.equal((await database.getMembers(db, '', 'due')).length, 0);
    assert.equal((await database.getDashboardStats(db)).outstandingDue, 0);
    assert.equal((await database.getReportData(db)).totalDue, 0);
  } finally { close(); }
});

test('profile metadata changes never rewrite a purchased membership period after catalog edits', async () => {
  const { db, close, input, plan } = await fixture();
  try {
    const id = await database.createMember(db, input);
    await database.updatePlan(db, plan.id, 'New quarterly offering', 3, 1600);
    await database.updateMemberProfile(db, id, {
      name: 'Renamed profile', gender: 'Other', phone: input.phone, joinedAt: '1999-12-15',
    });
    const detail = (await database.getMemberDetail(db, id))!;
    assert.equal(detail.joined_at, '1999-12-15');
    assert.equal(detail.start_date, '2000-01-01');
    assert.equal(detail.end_date, '2000-01-31');
    assert.equal(detail.total_amount, 600);
    assert.equal(detail.plan_name, 'Owner monthly');
  } finally { close(); }
});

test('membership history provides separate invoice totals and immutable purchased plan names', async () => {
  const { db, close, input, plan } = await fixture();
  try {
    const id = await database.createMember(db, input);
    await database.createMembership(db, { ...input, memberId: id, joiningDate: todayIso(), initialPayment: 600 });
    await database.updatePlan(db, plan.id, 'Renamed catalog plan', 2, 900);
    const detail = (await database.getMemberDetail(db, id))!;
    assert.equal(detail.memberships.length, 2);
    assert.deepEqual(detail.memberships.map((item) => item.plan_name), ['Owner monthly', 'Owner monthly']);
    for (const membership of detail.memberships) {
      const invoicePayments = detail.payments.filter((payment) => payment.membership_id === membership.id && !payment.voided_at);
      assert.equal(invoicePayments.reduce((sum, payment) => sum + payment.amount, 0), membership.paid_amount);
    }
    assert.equal(detail.memberships[0].paid_amount, 600);
    assert.equal(detail.memberships[1].paid_amount, 300);
  } finally { close(); }
});

test('reversal preserves the original entry and corrects balances, collections and historical views', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, input);
    const detail = (await database.getMemberDetail(db, id))!;
    const original = detail.payments[0];
    await database.reversePayment(db, id, original.id, 'Entered against the wrong member');
    const corrected = (await database.getMemberDetail(db, id))!;
    assert.equal(corrected.payments.length, 1);
    assert.equal(corrected.payments[0].amount, 300);
    assert.ok(corrected.payments[0].voided_at);
    assert.equal(corrected.payments[0].void_reason, 'Entered against the wrong member');
    assert.equal(corrected.paid_amount, 0);
    assert.equal(corrected.lifetime_due_amount, 600);
    assert.equal((await database.getReportData(db)).totalCollected, 0);
    assert.equal((await database.getPaymentHistory(db, { search: '', month: null, method: 'all' })).total, 0);
    const historical = (await database.getMembers(db, '', 'all', '2000-01-31'))[0];
    assert.equal(historical.paid_amount, 0);
    assert.equal(historical.due_amount, 600);
    await assert.rejects(database.reversePayment(db, id, original.id, 'Again'), /already|reversed/i);
    assert.equal((await database.getMemberDetail(db, id))!.paid_amount, 0);
  } finally { close(); }
});

test('reversal rejects blank reasons, missing payments and another member without mutation', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, input);
    const payment = (await database.getMemberDetail(db, id))!.payments[0];
    await assert.rejects(database.reversePayment(db, id, payment.id, '  '), /reason/i);
    await assert.rejects(database.reversePayment(db, id, 9999, 'Mistake'), /not found/i);
    await assert.rejects(database.reversePayment(db, id + 1, payment.id, 'Mistake'), /not found/i);
    assert.equal((await database.getMemberDetail(db, id))!.paid_amount, 300);
  } finally { close(); }
});

test('payment insertion is atomic and rejects invalid amount, dates, methods and cancelled memberships', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, input);
    const membershipId = (await database.getMemberDetail(db, id))!.membership_row_id!;
    for (const amount of [NaN, Infinity, -1, 0, 301]) {
      await assert.rejects(database.addPayment(db, id, membershipId, amount, 'Cash', todayIso()));
    }
    await assert.rejects(database.addPayment(db, id, membershipId, 10, 'Cash', '2026-02-30'), /date/i);
    await assert.rejects(database.addPayment(db, id, membershipId, 10, 'Other' as PaymentMethod, todayIso()), /method/i);
    await db.execAsync(`CREATE TRIGGER fail_payment BEFORE INSERT ON payments BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);
    await assert.rejects(database.addPayment(db, id, membershipId, 10, 'Cash', todayIso()), /injected failure/);
    assert.equal((await database.getMemberDetail(db, id))!.paid_amount, 300);
    await db.execAsync('DROP TRIGGER fail_payment;');
    await database.cancelMembership(db, id, membershipId);
    await assert.rejects(database.addPayment(db, id, membershipId, 10, 'Cash', todayIso()), /cancelled/i);
  } finally { close(); }
});

test('fresh installation has no assumed gym identity or prices and permits zero active plans', async () => {
  const { db, close } = memoryDatabase();
  try {
    await database.migrateDbIfNeeded(db);
    assert.deepEqual(await database.getPlans(db), []);
    assert.equal((await database.getGymProfile(db)).gymName, '');
    await database.createPlan(db, 'Custom annual', 12, 7500);
    const plan = (await database.getPlans(db))[0];
    await database.setPlanActive(db, plan.id, false);
    assert.deepEqual(await database.getPlans(db), []);
  } finally { close(); }
});

test('createMember participates in an enclosing transaction and duplicate import rolls back the entire batch', async () => {
  const { db, close, input } = await fixture();
  try {
    await assert.rejects(db.withExclusiveTransactionAsync(async (transaction) => {
      await database.createMember(transaction, input, { inTransaction: true });
      await database.createMember(transaction, input, { inTransaction: true });
    }), /already used|phone number/i);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM members'))?.count, 0);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM payments'))?.count, 0);
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await database.createMember(transaction, input, { inTransaction: true });
      await database.createMember(transaction, { ...input, phone: '9000000002' }, { inTransaction: true });
    });
    assert.equal((await database.getMembers(db)).length, 2);
  } finally { close(); }
});

test('member creation rejects inactive plans and malformed data before writing any records', async () => {
  const { db, close, input, plan } = await fixture();
  try {
    const invalidInputs: Partial<CreateMemberInput>[] = [
      { name: ' ' }, { phone: '123' }, { gender: 'bad' as CreateMemberInput['gender'] },
      { joiningDate: '2026-02-30' }, { initialPayment: NaN }, { discountAmount: Infinity },
      { admissionFee: -1 }, { initialPayment: 601 },
    ];
    for (const invalid of invalidInputs) await assert.rejects(database.createMember(db, { ...input, ...invalid }));
    await db.runAsync('UPDATE plans SET active = 0 WHERE id = ?', plan.id);
    await assert.rejects(database.createMember(db, input), /active/i);
    assert.equal((await database.getMembers(db)).length, 0);
  } finally { close(); }
});

test('paise amounts retain precision through installments, due filters and reversals', async () => {
  const { db, close, input } = await fixture();
  try {
    await database.createPlan(db, 'Paise plan', 1, 0.30);
    const plan = (await database.getPlans(db)).find((item) => item.name === 'Paise plan')!;
    assert.equal(plan.amount, 0.30);
    const id = await database.createMember(db, { ...input, planId: plan.id, initialPayment: 0.10 });
    const detail = (await database.getMemberDetail(db, id))!;
    await database.addPayment(db, id, detail.membership_row_id!, 0.20, 'UPI', todayIso());
    const paid = (await database.getMemberDetail(db, id))!;
    assert.equal(paid.paid_amount, 0.30);
    assert.equal(paid.lifetime_due_amount, 0);
    assert.equal((await database.getMembers(db, '', 'due')).length, 0);
    assert.equal((await database.getReportData(db)).totalCollected, 0.30);
    await database.reversePayment(db, id, paid.payments[0].id, 'Mistaken installment');
    assert.equal((await database.getMemberDetail(db, id))!.lifetime_due_amount, 0.20);
    assert.equal((await database.getMembers(db, '', 'due'))[0].due_amount, 0.20);
    await assert.rejects(database.addPayment(db, id, detail.membership_row_id!, 0.001, 'Cash', todayIso()), /decimal|paise/i);
    await assert.rejects(database.createPlan(db, 'Bad precision', 1, 1.001), /decimal|paise/i);
    await assert.rejects(database.createMember(db, { ...input, phone: '9000000002', discountAmount: 601 }), /discount/i);
  } finally { close(); }
});

test('reversal rollback restores both ledger and membership when recording the reason fails', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, input);
    const payment = (await database.getMemberDetail(db, id))!.payments[0];
    await db.execAsync(`CREATE TRIGGER fail_void BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT, 'injected reversal failure'); END;`);
    await assert.rejects(database.reversePayment(db, id, payment.id, 'Wrong amount'), /injected reversal failure/);
    const detail = (await database.getMemberDetail(db, id))!;
    assert.equal(detail.paid_amount, 300);
    assert.equal(detail.payments[0].voided_at, null);
  } finally { close(); }
});

test('audit history can include reversed entries without counting them as collections', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, { ...input, joiningDate: todayIso() });
    const payment = (await database.getMemberDetail(db, id))!.payments[0];
    await database.reversePayment(db, id, payment.id, 'Wrong amount');
    const history = await database.getPaymentHistory(db, { search: '', month: null, method: 'all', includeVoided: true });
    assert.equal(history.items.length, 1);
    assert.equal(history.total, 0);
    const report = await database.getReportData(db);
    assert.equal(report.totalCollected, 0);
    assert.equal(report.collectedThisMonth, 0);
    assert.deepEqual(report.paymentMethods, []);
    assert.deepEqual(report.recentPayments, []);
    assert.ok(report.monthlyCollection.every((month) => month.amount === 0));
    assert.equal((await database.getDashboardStats(db)).collectedThisMonth, 0);
  } finally { close(); }
});

test('legacy country-prefixed phones block duplicate creation while the same profile remains editable', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, input);
    await db.runAsync('UPDATE members SET phone = ? WHERE id = ?', `91${input.phone}`, id);
    await assert.rejects(database.createMember(db, input), /already used|phone number/i);
    await database.updateMemberProfile(db, id, { name: 'Edited original', gender: 'Other', phone: `+91 ${input.phone}`, joinedAt: input.joiningDate });
    assert.equal((await database.getMemberDetail(db, id))!.phone, input.phone);
    assert.equal((await database.getMembers(db)).length, 1);
  } finally { close(); }
});

test('future access is not counted active and its opening prepayment is collected on the actual receipt date', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, { ...input, joiningDate: '2099-01-01' });
    const detail = (await database.getMemberDetail(db, id))!;
    assert.equal(detail.payments[0].paid_at, todayIso());
    assert.equal((await database.getDashboardStats(db)).activeMembers, 0);
    assert.equal((await database.getReportData(db)).activeMembers, 0);
    assert.equal((await database.getMembers(db, '', 'active')).length, 0);
    assert.equal((await database.getDashboardStats(db)).collectedThisMonth, 300);
    await assert.rejects(database.createMember(db, { ...input, phone: '9000000002', paymentDate: '2099-01-01' }), /payment date/i);
  } finally { close(); }
});

test('explicit opening receipt dates do not follow backdated membership access dates', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, { ...input, paymentDate: todayIso() });
    const detail = (await database.getMemberDetail(db, id))!;
    assert.equal(detail.start_date, '2000-01-01');
    assert.equal(detail.payments[0].paid_at, todayIso());
    await database.createMembership(db, { ...input, memberId: id, joiningDate: '2000-02-01', paymentDate: todayIso() });
    assert.ok((await database.getMemberDetail(db, id))!.payments.every((payment) => payment.paid_at === todayIso()));
  } finally { close(); }
});

test('frozen access does not prevent settling an existing unpaid membership', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, input);
    const membership = (await database.getMemberDetail(db, id))!.membership_row_id!;
    await db.runAsync("UPDATE memberships SET status = 'frozen' WHERE id = ?", membership);
    await database.addPayment(db, id, membership, 300, 'Cash', todayIso());
    assert.equal((await database.getMemberDetail(db, id))!.lifetime_due_amount, 0);
  } finally { close(); }
});

test('current pending view includes future purchased periods while historical views stay date bounded', async () => {
  const { db, close, input } = await fixture();
  try {
    await database.createMember(db, { ...input, joiningDate: '2099-01-01' });
    const current = await database.getMembers(db, '', 'all');
    assert.equal(current.length, 1);
    assert.equal(current[0].snapshot_status, 'upcoming');
    const pending = await database.getMembers(db, '', 'due');
    assert.equal(pending[0].due_amount, 300);
    assert.equal(pending.reduce((sum, member) => sum + member.due_amount, 0), (await database.getDashboardStats(db)).outstandingDue);
    assert.equal((await database.getMembers(db, '', 'all', '2098-12-31')).length, 0);
    assert.equal((await database.getMembers(db, '', 'all', '2099-01-15'))[0].snapshot_status, 'active');
  } finally { close(); }
});

test('frozen and future access are excluded from active filters and dashboard recent rows name their state', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, { ...input, joiningDate: todayIso() });
    await db.runAsync("UPDATE memberships SET status = 'frozen' WHERE member_id = ?", id);
    assert.equal((await database.getMembers(db, '', 'active')).length, 0);
    assert.equal((await database.getMembers(db))[0].snapshot_status, 'frozen');
    assert.equal((await database.getDashboardStats(db)).recentMembers[0].snapshot_status, 'frozen');
  } finally { close(); }
});

test('pending balances remain reachable after latest cancellation or profile archival', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, input);
    const latest = await database.createMembership(db, { ...input, memberId: id, joiningDate: todayIso() });
    await database.cancelMembership(db, id, latest);
    assert.equal((await database.getMembers(db, '', 'due'))[0].due_amount, 300);
    await database.updateMemberStatus(db, id, 'archived');
    assert.equal((await database.getMembers(db, '', 'due'))[0]?.due_amount, 300);
    assert.equal((await database.getDashboardStats(db)).outstandingDue, 300);
  } finally { close(); }
});

test('a plan change and concurrent receipt cannot leave paid amounts above the revised total', async () => {
  const { db, close, input } = await fixture();
  try {
    const id = await database.createMember(db, { ...input, joiningDate: todayIso() });
    const membershipId = (await database.getMemberDetail(db, id))!.membership_row_id!;
    await database.createPlan(db, 'Cheaper owner plan', 2, 100);
    const replacement = (await database.getPlans(db)).find((plan) => plan.name === 'Cheaper owner plan')!;
    await Promise.allSettled([
      database.changeMembershipPlan(db, id, membershipId, replacement.id),
      database.addPayment(db, id, membershipId, 300, 'Cash', todayIso()),
    ]);
    const detail = (await database.getMemberDetail(db, id))!;
    assert.ok(detail.paid_amount <= detail.total_amount, `paid ${detail.paid_amount} exceeded total ${detail.total_amount}`);
    assert.equal(detail.paid_amount, detail.payments.filter((payment) => !payment.voided_at).reduce((sum, payment) => sum + payment.amount, 0));
    assert.equal(detail.plan_name, 'Cheaper owner plan');
  } finally { close(); }
});

test('expense entry retains paise and rejects amounts with sub-paise precision', async () => {
  const { db, close } = await fixture();
  try {
    await database.addExpense(db, 'Synthetic supplies', 10.25, todayIso(), 'Supplies');
    assert.equal((await database.getReportData(db)).expensesThisMonth, 10.25);
    await assert.rejects(database.addExpense(db, 'Invalid precision', 1.001, todayIso(), 'Supplies'), /decimal|paise/i);
  } finally { close(); }
});
