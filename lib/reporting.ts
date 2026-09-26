import type { SQLiteDatabase } from 'expo-sqlite';

import { addExpense } from './database.ts';
import { todayIso } from './format.ts';
import { currentMonthKey, monthRange, shiftMonth } from './history-period.ts';
import type { Expense, Payment } from './types.ts';

export type ReportPeriod = { month: string; start: string; end: string };
export type MonthlyReport = {
  period: ReportPeriod;
  collected: number;
  expenses: number;
  expenseCount: number;
  net: number;
  currentDues: number;
  monthlyCollection: { month: string; label: string; amount: number }[];
  paymentMethods: { method: string; amount: number }[];
  recentPayments: (Payment & { member_name: string })[];
};
export type ExpenseLedger = { items: Expense[]; count: number; total: number };
export type ExpenseDraft = { title: string; amount: string; date: string; category: string; notes: string };

export function reportPeriod(month: string, today = todayIso()): ReportPeriod {
  const range = monthRange(month);
  return { month, start: range.start, end: month === currentMonthKey(today) ? today : range.end };
}

export async function getMonthlyReport(db: SQLiteDatabase, month: string, today = todayIso()): Promise<MonthlyReport> {
  const period = reportPeriod(month, today);
  const chartStart = `${shiftMonth(month, -5)}-01`;
  const summary = await db.getFirstAsync<{ collected: number; expenses: number; expenseCount: number; currentDues: number }>(
    `SELECT
      COALESCE((SELECT ROUND(SUM(amount), 2) FROM payments WHERE voided_at IS NULL AND paid_at BETWEEN ? AND ?), 0) AS collected,
      COALESCE((SELECT ROUND(SUM(amount), 2) FROM expenses WHERE expense_date BETWEEN ? AND ?), 0) AS expenses,
      (SELECT COUNT(*) FROM expenses WHERE expense_date BETWEEN ? AND ?) AS expenseCount,
      COALESCE((SELECT ROUND(SUM(MAX(ROUND(total_amount - paid_amount, 2), 0)), 2) FROM memberships WHERE status != 'cancelled'), 0) AS currentDues`,
    period.start, period.end, period.start, period.end, period.start, period.end,
  );
  const collectionRows = await db.getAllAsync<{ month: string; amount: number }>(
    `SELECT substr(paid_at, 1, 7) AS month, ROUND(SUM(amount), 2) AS amount
     FROM payments WHERE voided_at IS NULL AND paid_at BETWEEN ? AND ?
     GROUP BY substr(paid_at, 1, 7)`, chartStart, period.end,
  );
  const amounts = new Map(collectionRows.map((item) => [item.month, item.amount]));
  const monthlyCollection = Array.from({ length: 6 }, (_, index) => {
    const key = shiftMonth(month, index - 5);
    return { month: key, label: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(`${key}-01T12:00:00`)), amount: amounts.get(key) ?? 0 };
  });
  const paymentMethods = await db.getAllAsync<{ method: string; amount: number }>(
    `SELECT method, ROUND(SUM(amount), 2) AS amount FROM payments
     WHERE voided_at IS NULL AND paid_at BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC, method`,
    period.start, period.end,
  );
  const recentPayments = await db.getAllAsync<MonthlyReport['recentPayments'][number]>(
    `SELECT p.*, m.name AS member_name FROM payments p JOIN members m ON m.id = p.member_id
     WHERE p.voided_at IS NULL AND p.paid_at BETWEEN ? AND ? ORDER BY p.paid_at DESC, p.id DESC LIMIT 5`,
    period.start, period.end,
  );
  const collected = summary?.collected ?? 0;
  const expenses = summary?.expenses ?? 0;
  return { period, collected, expenses, expenseCount: summary?.expenseCount ?? 0, currentDues: summary?.currentDues ?? 0,
    net: Math.round((collected - expenses) * 100) / 100, monthlyCollection, paymentMethods, recentPayments };
}

export async function getExpenseLedger(
  db: SQLiteDatabase, filters: { month: string | null; search: string }, today = todayIso(),
): Promise<ExpenseLedger> {
  const clauses: string[] = [];
  const args: string[] = [];
  const search = filters.search.trim();
  if (search) {
    const escaped = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    clauses.push("(title LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR COALESCE(notes, '') LIKE ? ESCAPE '\\')");
    args.push(escaped, escaped, escaped);
  }
  if (filters.month) {
    const period = reportPeriod(filters.month, today);
    clauses.push('expense_date BETWEEN ? AND ?');
    args.push(period.start, period.end);
  }
  const items = await db.getAllAsync<Expense>(
    `SELECT * FROM expenses ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY expense_date DESC, id DESC`, ...args,
  );
  return { items, count: items.length, total: Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100 };
}

export async function saveExpenseEntry(db: SQLiteDatabase, input: ExpenseDraft, today = todayIso()) {
  if (!input.title.trim()) throw new Error('Enter an expense title.');
  const date = new Date(`${input.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== input.date || input.date > today) {
    throw new Error('Enter a valid expense date no later than today.');
  }
  const value = input.amount.trim();
  const amount = Number(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    throw new Error('Expense amount must be between ₹0.01 and ₹1,00,00,000, with at most two decimal places.');
  }
  await addExpense(db, input.title, amount, input.date, input.category, input.notes);
}
