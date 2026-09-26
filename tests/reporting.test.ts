import assert from 'node:assert/strict';
import test from 'node:test';

import { addExpense, migrateDbIfNeeded } from '../lib/database.ts';
import { getExpenseLedger, getMonthlyReport, saveExpenseEntry } from '../lib/reporting.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

const TODAY = '2026-09-26';

async function seededReportDatabase() {
  const fixture = memoryDatabase();
  await migrateDbIfNeeded(fixture.db);
  await fixture.db.execAsync(`
    INSERT INTO plans(id,name,duration_months,amount,active) VALUES(1,'Owner plan',1,2000,1);
    INSERT INTO members(id,membership_id,name,gender,phone,joined_at) VALUES(1,'PF1','Ada','Female','9000000000','2026-01-01');
    INSERT INTO memberships(id,member_id,plan_id,plan_name,start_date,end_date,base_amount,total_amount,paid_amount,status)
    VALUES(1,1,1,'Owner plan','2026-09-01','2026-09-30',2000,2000,1000,'active'),
          (2,1,1,'Owner plan','2026-01-01','2026-01-31',2000,2000,100,'cancelled');
    INSERT INTO payments(member_id,membership_id,amount,method,paid_at,voided_at)
    VALUES(1,1,100,'Cash','2026-03-31',NULL),
          (1,1,200,'Cash','2026-04-01',NULL),
          (1,1,50,'Cash','2026-08-31',NULL),
          (1,1,100.25,'Cash','2026-09-01',NULL),
          (1,1,200.75,'UPI','2026-09-26',NULL),
          (1,1,999,'UPI','2026-09-27',NULL),
          (1,1,777,'Card','2026-09-30',NULL),
          (1,1,666,'Cash','2026-10-01',NULL),
          (1,1,444,'Cash','2026-09-15','2026-09-16');
  `);
  await addExpense(fixture.db, 'Last month', 88, '2026-08-31', 'Rent');
  await addExpense(fixture.db, 'Start', 20.25, '2026-09-01', 'General');
  await addExpense(fixture.db, 'Today', 30.75, TODAY, 'General');
  await addExpense(fixture.db, 'Future legacy entry', 990, '2026-09-27', 'General');
  return fixture;
}

test('selected current month caps every report component at today and excludes reversed receipts', async () => {
  const { db, close } = await seededReportDatabase();
  try {
    const result = await getMonthlyReport(db, '2026-09', TODAY);
    assert.deepEqual(result.period, { month: '2026-09', start: '2026-09-01', end: TODAY });
    assert.equal(result.collected, 301);
    assert.equal(result.expenses, 51);
    assert.equal(result.expenseCount, 2);
    assert.equal(result.net, 250);
    assert.equal(result.currentDues, 1000);
    assert.deepEqual(result.paymentMethods.map((item) => [item.method, item.amount]), [['UPI', 200.75], ['Cash', 100.25]]);
    assert.deepEqual(result.recentPayments.map((item) => item.amount), [200.75, 100.25]);
    assert.deepEqual(result.monthlyCollection.map((item) => [item.month, item.amount]), [
      ['2026-04', 200], ['2026-05', 0], ['2026-06', 0], ['2026-07', 0], ['2026-08', 50], ['2026-09', 301],
    ]);
  } finally { close(); }
});

test('historical reports use complete selected month and chart follows selected year across December', async () => {
  const { db, close } = await seededReportDatabase();
  try {
    const result = await getMonthlyReport(db, '2026-08', TODAY);
    assert.equal(result.period.end, '2026-08-31');
    assert.equal(result.collected, 50);
    assert.equal(result.expenses, 88);
    assert.equal(result.net, -38);
    assert.equal(result.monthlyCollection[0].month, '2026-03');
    const january = await getMonthlyReport(db, '2026-01', TODAY);
    assert.deepEqual(january.monthlyCollection.map((item) => item.month), ['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01']);
    await assert.rejects(() => getMonthlyReport(db, '2026-13', TODAY), /month/i);
  } finally { close(); }
});

test('expense ledger returns all 2000 rows and summary matches the actual filtered result', async () => {
  const { db, close } = memoryDatabase();
  try {
    await migrateDbIfNeeded(db);
    for (let i = 1; i <= 2000; i += 1) await addExpense(db, `Entry ${i}`, 0.01, i % 2 ? '2026-08-31' : '2026-09-01', 'General');
    const all = await getExpenseLedger(db, { month: null, search: '' }, TODAY);
    assert.equal(all.items.length, 2000);
    assert.equal(all.count, 2000);
    assert.equal(all.total, 20);
    assert.equal(new Set(all.items.map((item) => item.id)).size, 2000);
    assert.equal(all.items[0].id, 2000);
    const september = await getExpenseLedger(db, { month: '2026-09', search: '' }, TODAY);
    assert.equal(september.count, 1000);
    assert.equal(september.total, 10);
  } finally { close(); }
});

test('expense search treats SQL wildcard characters literally and searches title category and notes', async () => {
  const { db, close } = memoryDatabase();
  try {
    await migrateDbIfNeeded(db);
    await addExpense(db, '100% repair', 100, '2026-09-01', 'Machine_A', 'Back\\support');
    await addExpense(db, '1000 repair', 10, '2026-09-01', 'MachineBA', 'Plain note');
    for (const search of ['%', '_', '\\', 'machine_a', 'SUPPORT']) {
      const result = await getExpenseLedger(db, { month: null, search }, TODAY);
      assert.equal(result.count, 1, search);
      assert.equal(result.items[0].title, '100% repair');
      assert.equal(result.total, 100);
    }
    assert.equal((await getExpenseLedger(db, { month: null, search: "' OR 1=1 --" }, TODAY)).count, 0);
  } finally { close(); }
});

test('expense entry validates real dates and rupees before writing to SQLite', async () => {
  const { db, close } = memoryDatabase();
  try {
    await migrateDbIfNeeded(db);
    for (const date of ['2026-02-30', '2026-09-27', '', '2026-9-1']) {
      await assert.rejects(() => saveExpenseEntry(db, { title:'Rent', amount:'5', date, category:'', notes:'' }, TODAY), /date/i);
    }
    for (const amount of ['', '0', '-1', 'NaN', 'Infinity', '1e3', '2.001', '10000001']) {
      await assert.rejects(() => saveExpenseEntry(db, { title:'Rent', amount, date:TODAY, category:'', notes:'' }, TODAY), /amount/i);
    }
    await assert.rejects(() => saveExpenseEntry(db, { title:' ', amount:'5', date:TODAY, category:'', notes:'' }, TODAY), /title/i);
    assert.equal((await getExpenseLedger(db, { month:null, search:'' }, TODAY)).count, 0);
    await saveExpenseEntry(db, { title:'  Rent ', amount:'5.25', date:'2024-02-29', category:' ', notes:' Paid ' }, TODAY);
    const result = await getExpenseLedger(db, { month:null, search:'' }, TODAY);
    assert.deepEqual([result.items[0].title, result.items[0].amount, result.items[0].category, result.items[0].notes], ['Rent', 5.25, 'General', 'Paid']);
  } finally { close(); }
});
