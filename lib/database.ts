import type { SQLiteDatabase } from 'expo-sqlite';

import { addMonths, todayIso } from '@/lib/format';
import type {
  CreateMembershipInput,
  CreateMemberInput,
  DashboardStats,
  Expense,
  GymProfile,
  MemberDetail,
  MemberListItem,
  PaymentMethod,
  Plan,
  ReportData,
  UpdateMemberInput,
} from '@/lib/types';

const MEMBER_LIST_QUERY = `
  SELECT
    m.id,
    m.membership_id,
    m.name,
    m.gender,
    m.phone,
    m.photo_uri,
    m.status,
    m.joined_at,
    p.name AS plan_name,
    ms.status AS membership_status,
    ms.end_date,
    COALESCE(ms.total_amount, 0) AS total_amount,
    COALESCE(ms.paid_amount, 0) AS paid_amount,
    CASE
      WHEN ms.status = 'active'
      THEN MAX(COALESCE(ms.total_amount, 0) - COALESCE(ms.paid_amount, 0), 0)
      ELSE 0
    END AS due_amount,
    CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attended_today
  FROM members m
  LEFT JOIN memberships ms ON ms.id = (
    SELECT id FROM memberships
    WHERE member_id = m.id
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  )
  LEFT JOIN plans p ON p.id = ms.plan_id
  LEFT JOIN attendance a ON a.member_id = m.id AND a.attendance_date = ?
`;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((result?.user_version ?? 0) >= 1) return;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_months INTEGER NOT NULL,
      amount REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      membership_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      date_of_birth TEXT,
      address TEXT,
      notes TEXT,
      photo_uri TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      joined_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      base_amount REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      admission_fee REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      membership_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      check_in_time TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_id, attendance_date),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
    CREATE INDEX IF NOT EXISTS idx_memberships_member ON memberships(member_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paid_at);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);

    INSERT OR IGNORE INTO settings(key, value) VALUES
      ('gym_name', 'Pulse Fitness'),
      ('owner_name', ''),
      ('phone', ''),
      ('email', ''),
      ('address', '');

    INSERT INTO plans(name, duration_months, amount, active)
    SELECT '1 Month', 1, 600, 1
    WHERE NOT EXISTS (SELECT 1 FROM plans);
    INSERT INTO plans(name, duration_months, amount, active)
    SELECT '3 Months', 3, 1600, 1
    WHERE (SELECT COUNT(*) FROM plans) = 1;
    INSERT INTO plans(name, duration_months, amount, active)
    SELECT '6 Months', 6, 3000, 1
    WHERE (SELECT COUNT(*) FROM plans) = 2;
    INSERT INTO plans(name, duration_months, amount, active)
    SELECT '12 Months', 12, 5500, 1
    WHERE (SELECT COUNT(*) FROM plans) = 3;

    PRAGMA user_version = 1;
  `);
}

export async function getPlans(db: SQLiteDatabase) {
  return db.getAllAsync<Plan>('SELECT * FROM plans WHERE active = 1 ORDER BY duration_months');
}

export async function updatePlanPrice(db: SQLiteDatabase, planId: number, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Plan price must be greater than ₹0.');
  }
  const result = await db.runAsync(
    'UPDATE plans SET amount = ? WHERE id = ? AND active = 1',
    Math.round(amount),
    planId,
  );
  if (result.changes === 0) {
    throw new Error('This membership plan could not be found.');
  }
}

export async function getAllPlans(db: SQLiteDatabase) {
  return db.getAllAsync<Plan>('SELECT * FROM plans ORDER BY active DESC, duration_months, name');
}

function validatePlan(name: string, durationMonths: number, amount: number) {
  if (!name.trim()) throw new Error('Enter a plan name.');
  if (!Number.isInteger(durationMonths) || durationMonths <= 0) {
    throw new Error('Plan duration must be at least 1 month.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Plan price must be greater than zero.');
  }
}

export async function createPlan(
  db: SQLiteDatabase,
  name: string,
  durationMonths: number,
  amount: number,
) {
  validatePlan(name, durationMonths, amount);
  await db.runAsync(
    'INSERT INTO plans(name, duration_months, amount, active) VALUES (?, ?, ?, 1)',
    name.trim(),
    durationMonths,
    Math.round(amount),
  );
}

export async function updatePlan(
  db: SQLiteDatabase,
  planId: number,
  name: string,
  durationMonths: number,
  amount: number,
) {
  validatePlan(name, durationMonths, amount);
  const result = await db.runAsync(
    'UPDATE plans SET name = ?, duration_months = ?, amount = ? WHERE id = ?',
    name.trim(),
    durationMonths,
    Math.round(amount),
    planId,
  );
  if (result.changes === 0) throw new Error('This membership plan could not be found.');
}

export async function setPlanActive(db: SQLiteDatabase, planId: number, active: boolean) {
  if (!active) {
    const activePlans = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM plans WHERE active = 1',
    );
    if ((activePlans?.count ?? 0) <= 1) {
      throw new Error('Keep at least one membership plan active.');
    }
  }
  const result = await db.runAsync('UPDATE plans SET active = ? WHERE id = ?', active ? 1 : 0, planId);
  if (result.changes === 0) throw new Error('This membership plan could not be found.');
}

export async function getMembers(db: SQLiteDatabase, search = '') {
  const normalized = `%${search.trim()}%`;
  return db.getAllAsync<MemberListItem>(
    `${MEMBER_LIST_QUERY}
     WHERE m.status != 'archived'
       AND (m.name LIKE ? OR m.phone LIKE ? OR m.membership_id LIKE ?)
     ORDER BY m.created_at DESC`,
    todayIso(),
    normalized,
    normalized,
    normalized,
  );
}

export async function getMemberDetail(db: SQLiteDatabase, memberId: number) {
  const member = await db.getFirstAsync<Omit<MemberDetail, 'payments' | 'attendance_count'>>(
    `SELECT
      m.id,
      m.membership_id,
      m.name,
      m.gender,
      m.phone,
      m.photo_uri,
      m.status,
      m.joined_at,
      p.name AS plan_name,
      ms.status AS membership_status,
      ms.end_date,
      COALESCE(ms.total_amount, 0) AS total_amount,
      COALESCE(ms.paid_amount, 0) AS paid_amount,
      CASE
        WHEN ms.status = 'active'
        THEN MAX(COALESCE(ms.total_amount, 0) - COALESCE(ms.paid_amount, 0), 0)
        ELSE 0
      END AS due_amount,
      CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attended_today,
      m.email,
      m.date_of_birth,
      m.address,
      m.notes,
      ms.id AS membership_row_id,
      ms.start_date,
      COALESCE(ms.base_amount, 0) AS base_amount,
      COALESCE(ms.discount_amount, 0) AS discount_amount,
      COALESCE(ms.admission_fee, 0) AS admission_fee
     FROM members m
     LEFT JOIN memberships ms ON ms.id = (
       SELECT id FROM memberships
       WHERE member_id = m.id
       ORDER BY start_date DESC, id DESC
       LIMIT 1
     )
     LEFT JOIN plans p ON p.id = ms.plan_id
     LEFT JOIN attendance a ON a.member_id = m.id AND a.attendance_date = ?
     WHERE m.id = ?
     GROUP BY m.id`,
    todayIso(),
    memberId,
  );
  if (!member) return null;

  const payments = await db.getAllAsync<MemberDetail['payments'][number]>(
    'SELECT * FROM payments WHERE member_id = ? ORDER BY paid_at DESC, id DESC',
    memberId,
  );
  const attendance = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM attendance WHERE member_id = ?',
    memberId,
  );
  return { ...member, payments, attendance_count: attendance?.count ?? 0 };
}

export async function createMember(db: SQLiteDatabase, input: CreateMemberInput) {
  const plan = await db.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', input.planId);
  if (!plan) throw new Error('The selected plan no longer exists.');

  const nextId = await db.getFirstAsync<{ next_id: number }>(
    'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM members',
  );
  const membershipCode = `PF-${String(nextId?.next_id ?? 1).padStart(4, '0')}`;
  const discount = Math.max(0, input.discountAmount || 0);
  const admissionFee = Math.max(0, input.admissionFee || 0);
  const totalAmount = Math.max(0, plan.amount - discount + admissionFee);
  const payment = Math.min(Math.max(0, input.initialPayment || 0), totalAmount);
  const endDate = addMonths(input.joiningDate, plan.duration_months);
  let memberId = 0;

  await db.withTransactionAsync(async () => {
    const memberResult = await db.runAsync(
      `INSERT INTO members
       (membership_id, name, gender, phone, email, date_of_birth, address, notes, photo_uri, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      membershipCode,
      input.name.trim(),
      input.gender,
      input.phone.trim(),
      input.email?.trim() || null,
      input.dateOfBirth || null,
      input.address?.trim() || null,
      input.notes?.trim() || null,
      input.photoUri || null,
      input.joiningDate,
    );
    memberId = Number(memberResult.lastInsertRowId);

    const membershipResult = await db.runAsync(
      `INSERT INTO memberships
       (member_id, plan_id, start_date, end_date, base_amount, discount_amount, admission_fee, total_amount, paid_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      memberId,
      plan.id,
      input.joiningDate,
      endDate,
      plan.amount,
      discount,
      admissionFee,
      totalAmount,
      payment,
    );

    if (payment > 0) {
      await db.runAsync(
        `INSERT INTO payments(member_id, membership_id, amount, method, paid_at, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        memberId,
        Number(membershipResult.lastInsertRowId),
        payment,
        input.paymentMethod,
        input.joiningDate,
        'Initial payment',
      );
    }
  });

  return memberId;
}

export async function updateMemberProfile(
  db: SQLiteDatabase,
  memberId: number,
  input: UpdateMemberInput,
) {
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `UPDATE members
       SET name = ?, gender = ?, phone = ?, email = ?, date_of_birth = ?, address = ?,
         notes = ?, photo_uri = ?, joined_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.name.trim(),
      input.gender,
      input.phone.trim(),
      input.email?.trim() || null,
      input.dateOfBirth || null,
      input.address?.trim() || null,
      input.notes?.trim() || null,
      input.photoUri || null,
      input.joinedAt,
      memberId,
    );
    if (result.changes === 0) throw new Error('Member not found.');

    const membershipCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM memberships WHERE member_id = ?',
      memberId,
    );
    if ((membershipCount?.count ?? 0) === 1) {
      const membership = await db.getFirstAsync<{ id: number; duration_months: number }>(
        `SELECT ms.id, p.duration_months
         FROM memberships ms
         JOIN plans p ON p.id = ms.plan_id
         WHERE ms.member_id = ?
         ORDER BY ms.start_date DESC, ms.id DESC
         LIMIT 1`,
        memberId,
      );
      if (membership) {
        await db.runAsync(
          'UPDATE memberships SET start_date = ?, end_date = ? WHERE id = ?',
          input.joinedAt,
          addMonths(input.joinedAt, membership.duration_months),
          membership.id,
        );
      }
    }
  });
}

export async function createMembership(db: SQLiteDatabase, input: CreateMembershipInput) {
  const [member, plan, current] = await Promise.all([
    db.getFirstAsync<{ id: number }>('SELECT id FROM members WHERE id = ?', input.memberId),
    db.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ? AND active = 1', input.planId),
    db.getFirstAsync<{ id: number; end_date: string; status: string }>(
      `SELECT id, end_date, status FROM memberships
       WHERE member_id = ? ORDER BY start_date DESC, id DESC LIMIT 1`,
      input.memberId,
    ),
  ]);
  if (!member) throw new Error('Member not found.');
  if (!plan) throw new Error('The selected plan is no longer active.');
  if (current?.status === 'active' && current.end_date >= todayIso()) {
    throw new Error('This member already has an active membership. Cancel it before assigning another plan.');
  }

  const discount = Math.max(0, input.discountAmount || 0);
  const admissionFee = Math.max(0, input.admissionFee || 0);
  const totalAmount = Math.max(0, plan.amount - discount + admissionFee);
  const payment = Math.min(Math.max(0, input.initialPayment || 0), totalAmount);
  const endDate = addMonths(input.joiningDate, plan.duration_months);
  let membershipId = 0;

  await db.withTransactionAsync(async () => {
    if (current?.status === 'active') {
      await db.runAsync("UPDATE memberships SET status = 'expired' WHERE id = ?", current.id);
    }
    const result = await db.runAsync(
      `INSERT INTO memberships
       (member_id, plan_id, start_date, end_date, base_amount, discount_amount, admission_fee, total_amount, paid_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.memberId,
      plan.id,
      input.joiningDate,
      endDate,
      plan.amount,
      discount,
      admissionFee,
      totalAmount,
      payment,
    );
    membershipId = Number(result.lastInsertRowId);
    if (payment > 0) {
      await db.runAsync(
        `INSERT INTO payments(member_id, membership_id, amount, method, paid_at, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        input.memberId,
        membershipId,
        payment,
        input.paymentMethod,
        input.joiningDate,
        'Membership opening payment',
      );
    }
    await db.runAsync(
      "UPDATE members SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      input.memberId,
    );
  });

  return membershipId;
}

export async function addPayment(
  db: SQLiteDatabase,
  memberId: number,
  membershipId: number,
  amount: number,
  method: PaymentMethod,
  paidAt: string,
  note?: string,
) {
  const membership = await db.getFirstAsync<{
    total_amount: number;
    paid_amount: number;
    status: string;
  }>(
    'SELECT total_amount, paid_amount, status FROM memberships WHERE id = ? AND member_id = ?',
    membershipId,
    memberId,
  );
  if (!membership) throw new Error('Membership not found.');
  if (membership.status !== 'active') {
    throw new Error('Payments can only be added to an active membership.');
  }
  const remaining = Math.max(0, membership.total_amount - membership.paid_amount);
  if (amount <= 0 || amount > remaining) {
    throw new Error(`Payment must be between ₹1 and ₹${remaining}.`);
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO payments(member_id, membership_id, amount, method, paid_at, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      memberId,
      membershipId,
      amount,
      method,
      paidAt,
      note?.trim() || null,
    );
    await db.runAsync(
      'UPDATE memberships SET paid_amount = paid_amount + ? WHERE id = ?',
      amount,
      membershipId,
    );
  });
}

export async function toggleAttendance(db: SQLiteDatabase, memberId: number, date = todayIso()) {
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM attendance WHERE member_id = ? AND attendance_date = ?',
    memberId,
    date,
  );
  if (existing) {
    await db.runAsync('DELETE FROM attendance WHERE id = ?', existing.id);
    return false;
  }
  const now = new Date();
  const checkIn = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  await db.runAsync(
    'INSERT INTO attendance(member_id, attendance_date, check_in_time) VALUES (?, ?, ?)',
    memberId,
    date,
    checkIn,
  );
  return true;
}

export async function updateMemberStatus(
  db: SQLiteDatabase,
  memberId: number,
  status: 'active' | 'blocked' | 'archived',
) {
  await db.runAsync(
    'UPDATE members SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    status,
    memberId,
  );
}

export async function cancelMembership(
  db: SQLiteDatabase,
  memberId: number,
  membershipId: number,
) {
  const result = await db.runAsync(
    `UPDATE memberships
     SET status = 'cancelled'
     WHERE id = ? AND member_id = ? AND status = 'active'`,
    membershipId,
    memberId,
  );
  if (result.changes === 0) {
    throw new Error('This membership is no longer active.');
  }
}

export async function deleteMember(db: SQLiteDatabase, memberId: number) {
  const result = await db.runAsync('DELETE FROM members WHERE id = ?', memberId);
  if (result.changes === 0) {
    throw new Error('Member not found.');
  }
}

export async function getDashboardStats(db: SQLiteDatabase): Promise<DashboardStats> {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const memberCounts = await db.getFirstAsync<{
    active_members: number;
    total_members: number;
    expiring_soon: number;
  }>(
    `SELECT
      SUM(CASE WHEN m.status = 'active' AND ms.status = 'active' AND ms.end_date >= ? THEN 1 ELSE 0 END) AS active_members,
      COUNT(*) AS total_members,
      SUM(CASE WHEN ms.status = 'active' AND ms.end_date BETWEEN ? AND date(?, '+7 day') THEN 1 ELSE 0 END) AS expiring_soon
     FROM members m
     LEFT JOIN memberships ms ON ms.id = (
       SELECT id FROM memberships WHERE member_id = m.id ORDER BY start_date DESC, id DESC LIMIT 1
     )
     WHERE m.status != 'archived'`,
    today,
    today,
    today,
  );
  const finance = await db.getFirstAsync<{ collected: number; due: number }>(
    `SELECT
      COALESCE((SELECT SUM(amount) FROM payments WHERE paid_at BETWEEN ? AND ?), 0) AS collected,
      COALESCE((SELECT SUM(MAX(total_amount - paid_amount, 0)) FROM memberships WHERE status = 'active'), 0) AS due`,
    monthStart,
    today,
  );
  const present = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM attendance WHERE attendance_date = ?',
    today,
  );
  const recentMembers = await db.getAllAsync<MemberListItem>(
    `${MEMBER_LIST_QUERY}
     WHERE m.status != 'archived'
     ORDER BY m.created_at DESC
     LIMIT 4`,
    today,
  );
  const expiringMembers = await db.getAllAsync<MemberListItem>(
    `${MEMBER_LIST_QUERY}
     WHERE m.status = 'active' AND ms.status = 'active'
       AND ms.end_date BETWEEN ? AND date(?, '+7 day')
     ORDER BY ms.end_date ASC
     LIMIT 5`,
    today,
    today,
    today,
  );
  const weeklyAttendance: { label: string; count: number }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const iso = date.toISOString().slice(0, 10);
    const count = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM attendance WHERE attendance_date = ?',
      iso,
    );
    weeklyAttendance.push({
      label: date.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 1),
      count: count?.count ?? 0,
    });
  }

  return {
    activeMembers: memberCounts?.active_members ?? 0,
    totalMembers: memberCounts?.total_members ?? 0,
    expiringSoon: memberCounts?.expiring_soon ?? 0,
    presentToday: present?.count ?? 0,
    collectedThisMonth: finance?.collected ?? 0,
    outstandingDue: finance?.due ?? 0,
    recentMembers,
    expiringMembers,
    weeklyAttendance,
  };
}

export async function getReportData(db: SQLiteDatabase): Promise<ReportData> {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const summary = await db.getFirstAsync<{
    active_members: number;
    total_billed: number;
    total_collected: number;
    total_due: number;
  }>(
    `SELECT
      (SELECT COUNT(*)
       FROM members m
       WHERE m.status = 'active'
         AND EXISTS (
           SELECT 1 FROM memberships ms
           WHERE ms.member_id = m.id AND ms.status = 'active'
         )) AS active_members,
      COALESCE(SUM(CASE WHEN status = 'cancelled' THEN paid_amount ELSE total_amount END), 0) AS total_billed,
      COALESCE(SUM(paid_amount), 0) AS total_collected,
      COALESCE(SUM(CASE
        WHEN status = 'active' THEN MAX(total_amount - paid_amount, 0)
        ELSE 0
      END), 0) AS total_due
     FROM memberships`,
  );
  const month = await db.getFirstAsync<{ collected: number; expenses: number }>(
    `SELECT
      COALESCE((SELECT SUM(amount) FROM payments WHERE paid_at BETWEEN ? AND ?), 0) AS collected,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date BETWEEN ? AND ?), 0) AS expenses`,
    monthStart,
    today,
    monthStart,
    today,
  );
  const monthlyCollection: { label: string; amount: number }[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const total = await db.getFirstAsync<{ amount: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE substr(paid_at, 1, 7) = ?',
      key,
    );
    monthlyCollection.push({
      label: date.toLocaleDateString('en-IN', { month: 'short' }),
      amount: total?.amount ?? 0,
    });
  }
  const paymentMethods = await db.getAllAsync<{ method: string; amount: number }>(
    `SELECT method, SUM(amount) AS amount
     FROM payments
     GROUP BY method
     ORDER BY amount DESC`,
  );
  const recentPayments = await db.getAllAsync<ReportData['recentPayments'][number]>(
    `SELECT p.*, m.name AS member_name
     FROM payments p
     JOIN members m ON m.id = p.member_id
     ORDER BY p.paid_at DESC, p.id DESC
     LIMIT 10`,
  );
  const recentExpenses = await db.getAllAsync<Expense>(
    'SELECT * FROM expenses ORDER BY expense_date DESC, id DESC LIMIT 10',
  );

  const collectedThisMonth = month?.collected ?? 0;
  const expensesThisMonth = month?.expenses ?? 0;
  return {
    activeMembers: summary?.active_members ?? 0,
    totalBilled: summary?.total_billed ?? 0,
    totalCollected: summary?.total_collected ?? 0,
    totalDue: summary?.total_due ?? 0,
    collectedThisMonth,
    expensesThisMonth,
    netThisMonth: collectedThisMonth - expensesThisMonth,
    monthlyCollection,
    paymentMethods,
    recentPayments,
    recentExpenses,
  };
}

export async function addExpense(
  db: SQLiteDatabase,
  title: string,
  amount: number,
  expenseDate: string,
  category: string,
  notes?: string,
) {
  if (!title.trim()) throw new Error('Enter an expense title.');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }
  await db.runAsync(
    `INSERT INTO expenses(title, amount, expense_date, category, notes)
     VALUES (?, ?, ?, ?, ?)`,
    title.trim(),
    Math.round(amount),
    expenseDate,
    category.trim() || 'General',
    notes?.trim() || null,
  );
}

export async function deleteExpense(db: SQLiteDatabase, expenseId: number) {
  const result = await db.runAsync('DELETE FROM expenses WHERE id = ?', expenseId);
  if (result.changes === 0) throw new Error('Expense not found.');
}

export async function getGymProfile(db: SQLiteDatabase): Promise<GymProfile> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    gymName: settings.gym_name || 'Pulse Fitness',
    ownerName: settings.owner_name || '',
    phone: settings.phone || '',
    email: settings.email || '',
    address: settings.address || '',
  };
}

export async function saveGymProfile(db: SQLiteDatabase, profile: GymProfile) {
  const entries = [
    ['gym_name', profile.gymName],
    ['owner_name', profile.ownerName],
    ['phone', profile.phone],
    ['email', profile.email],
    ['address', profile.address],
  ];
  await db.withTransactionAsync(async () => {
    for (const [key, value] of entries) {
      await db.runAsync(
        'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value.trim(),
      );
    }
  });
}
