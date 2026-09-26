import assert from 'node:assert/strict';
import test from 'node:test';

import { createMember, createPlan, getDashboardStats, getPlans, migrateDbIfNeeded, toggleAttendance } from '../lib/database.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

async function fixture() {
  const state = memoryDatabase();
  await migrateDbIfNeeded(state.db);
  await createPlan(state.db, 'Owner plan', 1, 500);
  const plan = (await getPlans(state.db))[0];
  const memberId = await createMember(state.db, {
    name: 'Asha', gender: 'Other', phone: '9000000001', planId: plan.id,
    joiningDate: '2026-01-01', discountAmount: 0, admissionFee: 0,
    initialPayment: 0, paymentMethod: 'Cash',
  });
  return { ...state, memberId, plan };
}

test('attendance rejects malformed, impossible and future dates without writing records', async () => {
  const { db, close, memberId } = await fixture();
  try {
    for (const date of ['2026-02-30', '2026-2-03', '', '2099-01-01']) {
      await assert.rejects(toggleAttendance(db, memberId, date), /date/i);
    }
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM attendance'))?.count, 0);
  } finally { close(); }
});

test('historical attendance cannot predate member joining or target a missing member', async () => {
  const { db, close, memberId } = await fixture();
  try {
    await assert.rejects(toggleAttendance(db, memberId, '2025-12-31'), /join/i);
    await assert.rejects(toggleAttendance(db, 999, '2026-01-02'), /member/i);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM attendance'))?.count, 0);
  } finally { close(); }
});

test('dashboard weekly attendance uses the same local day as check-in before sunrise in India', async (context) => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-25T19:00:00Z').getTime() });
  const { db, close, memberId } = await fixture();
  try {
    await toggleAttendance(db, memberId);
    const stats = await getDashboardStats(db);
    assert.equal(stats.presentToday, 1);
    assert.deepEqual(stats.weeklyAttendance.map((day) => day.count), [0, 0, 0, 0, 0, 0, 1]);
  } finally { close(); context.mock.timers.reset(); process.env.TZ = originalTimezone; }
});

test('selected-day roster excludes not-yet-joined members and keeps daily totals when searching', async () => {
  const { getAttendanceData, setAttendance } = await import('../lib/attendance.ts');
  const { db, close, memberId, plan } = await fixture();
  try {
    const second = await createMember(db, { name: 'Bina', gender: 'Other', phone: '9000000002', planId: plan.id, joiningDate: '2026-01-01', discountAmount: 0, admissionFee: 0, initialPayment: 0, paymentMethod: 'Cash' });
    await createMember(db, { name: 'Later member', gender: 'Other', phone: '9000000003', planId: plan.id, joiningDate: '2026-02-01', discountAmount: 0, admissionFee: 0, initialPayment: 0, paymentMethod: 'Cash' });
    await setAttendance(db, memberId, '2026-01-02', true);
    await setAttendance(db, second, '2026-01-02', true);
    await setAttendance(db, memberId, '2026-01-03', true);
    const all = await getAttendanceData(db, { date: '2026-01-02', search: '', filter: 'all' });
    assert.deepEqual(all.members.map((member) => member.name).sort(), ['Asha', 'Bina']);
    assert.equal(all.presentCount, 2);
    const searched = await getAttendanceData(db, { date: '2026-01-02', search: 'Asha', filter: 'present' });
    assert.deepEqual(searched.members.map((member) => member.name), ['Asha']);
    assert.equal(searched.presentCount, 2);
    const nextDay = await getAttendanceData(db, { date: '2026-01-03', search: '', filter: 'absent' });
    assert.deepEqual(nextDay.members.map((member) => member.name), ['Bina']);
    assert.equal(nextDay.presentCount, 1);
  } finally { close(); }
});

test('explicit attendance writes are idempotent and failed writes leave the previous state intact', async () => {
  const { setAttendance } = await import('../lib/attendance.ts');
  const { db, close, memberId } = await fixture();
  try {
    await setAttendance(db, memberId, '2026-01-02', true);
    await setAttendance(db, memberId, '2026-01-02', true);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM attendance'))?.count, 1);
    await db.execAsync("CREATE TRIGGER fail_attendance BEFORE DELETE ON attendance BEGIN SELECT RAISE(ABORT, 'injected attendance failure'); END;");
    await assert.rejects(setAttendance(db, memberId, '2026-01-02', false), /injected/);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM attendance'))?.count, 1);
    await db.execAsync('DROP TRIGGER fail_attendance;');
    await setAttendance(db, memberId, '2026-01-02', false);
    await setAttendance(db, memberId, '2026-01-02', false);
    assert.equal((await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM attendance'))?.count, 0);
  } finally { close(); }
});

test('dashboard expiry count excludes blocked profiles just like the visible expiry list', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-26T12:00:00').getTime() });
  const { db, close, memberId } = await fixture();
  try {
    await db.runAsync("UPDATE members SET status = 'blocked' WHERE id = ?", memberId);
    await db.runAsync("UPDATE memberships SET start_date = '2026-09-01', end_date = '2026-09-30' WHERE member_id = ?", memberId);
    const stats = await getDashboardStats(db);
    assert.equal(stats.expiringSoon, 0);
    assert.equal(stats.activeMembers, 0);
    assert.deepEqual(stats.expiringMembers, []);
  } finally { close(); context.mock.timers.reset(); }
});
