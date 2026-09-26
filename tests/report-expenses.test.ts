import assert from 'node:assert/strict';
import test from 'node:test';

import { addExpense, getReportData, migrateDbIfNeeded } from '../lib/database.ts';
import { todayIso } from '../lib/format.ts';
import { memoryDatabase } from './helpers/sqlite.ts';

test('Reports includes every expense beyond the first ten without changing monthly totals', async () => {
  const { db, close } = memoryDatabase();
  try {
    await migrateDbIfNeeded(db);
    await addExpense(db, 'Older equipment', 2000, '2000-01-01', 'Equipment');
    for (let number = 1; number <= 35; number += 1) {
      await addExpense(db, `Expense ${number}`, number, todayIso(), 'General');
    }

    const report = await getReportData(db);
    assert.equal(report.recentExpenses.length, 36);
    assert.equal(report.recentExpenses[0].title, 'Expense 35');
    assert.equal(report.recentExpenses[10].title, 'Expense 25');
    assert.equal(report.recentExpenses[35].title, 'Older equipment');
    assert.equal(new Set(report.recentExpenses.map((expense) => expense.id)).size, 36);
    assert.equal(report.expensesThisMonth, 630);
    assert.equal(report.netThisMonth, -630);
  } finally { close(); }
});
