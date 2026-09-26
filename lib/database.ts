import type { SQLiteDatabase } from 'expo-sqlite';

import { addMonths, todayIso } from '@/lib/format';
import { buildMemberSnapshotQuery } from '@/lib/member-query';
import { CREATE_MEMBER_PHONE_GUARDS_SQL } from '@/lib/member-phone-guards';
import { normalizeMemberPhone } from '@/lib/member-phone';
export { normalizeMemberPhone } from '@/lib/member-phone';
import { buildPaymentHistoryQuery } from '@/lib/payment-query';
import type {
  CreateMembershipInput,
  CreateMemberInput,
  DashboardStats,
  Expense,
  GymProfile,
  MemberDetail,
  MemberFilter,
  MemberListItem,
  Membership,
  Payment,
  PaymentMethod,
  PaymentHistoryFilters,
  PaymentHistoryItem,
  PaymentHistoryResult,
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
    ms.plan_id,
    COALESCE(ms.plan_name, p.name) AS plan_name,
    ms.status AS membership_status,
    ms.end_date,
    COALESCE(ms.total_amount, 0) AS total_amount,
    COALESCE(ms.paid_amount, 0) AS paid_amount,
    COALESCE((SELECT ROUND(SUM(MAX(ROUND(owed.total_amount - owed.paid_amount, 2), 0)), 2)
      FROM memberships owed WHERE owed.member_id = m.id AND owed.status != 'cancelled'), 0) AS due_amount,
    CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attended_today,
    CASE WHEN ms.id IS NULL THEN 'none'
      WHEN ms.status = 'cancelled' THEN 'cancelled'
      WHEN ms.status = 'frozen' THEN 'frozen'
      WHEN ms.start_date > ? THEN 'upcoming'
      WHEN ms.end_date < ? THEN 'expired'
      ELSE 'active' END AS snapshot_status,
    ? AS snapshot_date
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
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion < 1) {
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
      ('gym_name', ''),
      ('owner_name', ''),
      ('phone', ''),
      ('email', ''),
      ('address', '');

    PRAGMA user_version = 1;
  `);
  }

  if (currentVersion < 2) {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
      PRAGMA user_version = 2;
    `);
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_memberships_start_end ON memberships(member_id, start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_payments_method_date ON payments(method, paid_at);
      INSERT OR IGNORE INTO settings(key, value) VALUES
        ('last_backup_at', ''),
        ('last_backup_file', '');
      PRAGMA user_version = 3;
    `);
  }

  if (currentVersion < 4) {
    const cancelledAtColumn = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM pragma_table_info('memberships') WHERE name = 'cancelled_at'",
    );
    if (!cancelledAtColumn) {
      await db.execAsync('ALTER TABLE memberships ADD COLUMN cancelled_at TEXT;');
    }
    await db.execAsync(CREATE_MEMBER_PHONE_GUARDS_SQL);
    await db.execAsync('PRAGMA user_version = 4;');
  }

  if (currentVersion < 5) {
    for (const [table, column] of [
      ['memberships', 'plan_name'],
      ['payments', 'voided_at'],
      ['payments', 'void_reason'],
    ]) {
      const existing = await db.getFirstAsync<{ name: string }>(
        `SELECT name FROM pragma_table_info('${table}') WHERE name = '${column}'`,
      );
      if (!existing) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT;`);
    }
    // Older records can only snapshot the catalog name available at migration time.
    await db.execAsync(`
      UPDATE memberships SET plan_name = (SELECT name FROM plans WHERE id = memberships.plan_id)
      WHERE plan_name IS NULL;
      PRAGMA user_version = 5;
    `);
  }
}

export async function getPlans(db: SQLiteDatabase) {
  return db.getAllAsync<Plan>('SELECT * FROM plans WHERE active = 1 ORDER BY duration_months');
}

export async function updatePlanPrice(db: SQLiteDatabase, planId: number, amount: number) {
  validateMoney(amount, 'Plan price', true);
  const result = await db.runAsync(
    'UPDATE plans SET amount = ? WHERE id = ? AND active = 1',
    roundMoney(amount),
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
  validateMoney(amount, 'Plan price', true);
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
    roundMoney(amount),
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
    roundMoney(amount),
    planId,
  );
  if (result.changes === 0) throw new Error('This membership plan could not be found.');
}

export async function setPlanActive(db: SQLiteDatabase, planId: number, active: boolean) {
  const result = await db.runAsync('UPDATE plans SET active = ? WHERE id = ?', active ? 1 : 0, planId);
  if (result.changes === 0) throw new Error('This membership plan could not be found.');
}

function validateDate(value: string, label: string, allowFuture = true) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== value || (!allowFuture && value > todayIso())) {
    throw new Error(`Enter a valid ${label}${allowFuture ? '' : ' no later than today'}.`);
  }
}

function validatePaymentMethod(method: PaymentMethod) {
  if (!(['Cash', 'UPI', 'Card', 'Bank transfer'] as string[]).includes(method)) {
    throw new Error('Choose a valid payment method.');
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function validateMoney(value: number, label: string, positive = false) {
  if (!Number.isFinite(value) || value < 0 || (positive && value === 0) || value > 10_000_000) {
    throw new Error(`${label} must be ${positive ? 'greater than zero' : 'nonnegative'} and no more than ₹1,00,00,000.`);
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw new Error(`${label} can have at most two decimal places (paise).`);
  }
}

function membershipAmounts(input: CreateMembershipInput | CreateMemberInput, plan: Plan) {
  validateDate(input.joiningDate, 'membership start date');
  validatePaymentMethod(input.paymentMethod);
  for (const [label, value] of [
    ['Discount', input.discountAmount], ['Admission fee', input.admissionFee],
    ['Opening payment', input.initialPayment],
  ] as const) {
    validateMoney(value, label);
  }
  if (input.discountAmount > plan.amount) throw new Error('Discount cannot exceed the plan price.');
  const totalAmount = roundMoney(plan.amount - input.discountAmount + input.admissionFee);
  if (!Number.isFinite(totalAmount)) throw new Error('Membership total is invalid.');
  if (input.initialPayment > totalAmount) throw new Error('Opening payment cannot exceed the membership total.');
  // Legacy callers used the access start as the receipt date. Keep historical
  // imports stable, but a future access period cannot create a future receipt.
  const paymentDate = input.paymentDate ?? (input.joiningDate > todayIso() ? todayIso() : input.joiningDate);
  if (input.initialPayment > 0) validateDate(paymentDate, 'opening payment date', false);
  return {
    discount: roundMoney(input.discountAmount), admissionFee: roundMoney(input.admissionFee),
    totalAmount, payment: roundMoney(input.initialPayment), paymentDate,
  };
}

async function assertUniquePhone(db: SQLiteDatabase, phone: string, excludedMemberId?: number) {
  const members = await db.getAllAsync<{ id: number; name: string; phone: string }>(
    'SELECT id, name, phone FROM members WHERE (? IS NULL OR id != ?)',
    excludedMemberId ?? null,
    excludedMemberId ?? null,
  );
  // Legacy versions stored both 10-digit and 91-prefixed values. Compare their
  // canonical identities without rewriting old profiles during migration.
  const existing = members.find((member) => {
    try { return normalizeMemberPhone(member.phone) === phone; }
    catch { return member.phone === phone; }
  });
  if (existing) {
    throw new Error(`This mobile number is already used by ${existing.name}.`);
  }
}

export async function getMembers(
  db: SQLiteDatabase,
  search = '',
  filter: MemberFilter = 'all',
  snapshotDate = todayIso(),
) {
  const query = buildMemberSnapshotQuery({
    search,
    filter,
    snapshotDate,
    attendanceDate: todayIso(),
    currentView: snapshotDate === todayIso(),
  });
  return db.getAllAsync<MemberListItem>(query.sql, ...query.args);
}

export async function getMemberDetail(db: SQLiteDatabase, memberId: number) {
  const member = await db.getFirstAsync<Omit<MemberDetail, 'payments' | 'attendance_count' | 'memberships' | 'lifetime_due_amount'>>(
    `SELECT
      m.id,
      m.membership_id,
      m.name,
      m.gender,
      m.phone,
      m.photo_uri,
      m.status,
      m.joined_at,
      ms.plan_id,
      COALESCE(ms.plan_name, p.name) AS plan_name,
      ms.status AS membership_status,
      ms.end_date,
      COALESCE(ms.total_amount, 0) AS total_amount,
      COALESCE(ms.paid_amount, 0) AS paid_amount,
      CASE
        WHEN ms.status != 'cancelled'
        THEN MAX(ROUND(COALESCE(ms.total_amount, 0) - COALESCE(ms.paid_amount, 0), 2), 0)
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
  const memberships = await db.getAllAsync<Membership>(
    `SELECT ms.*, COALESCE(ms.plan_name, p.name, 'Membership') AS plan_name,
      CASE WHEN ms.status != 'cancelled' THEN MAX(ROUND(ms.total_amount - ms.paid_amount, 2), 0) ELSE 0 END AS due_amount
     FROM memberships ms JOIN plans p ON p.id = ms.plan_id
     WHERE ms.member_id = ? ORDER BY ms.start_date DESC, ms.id DESC`,
    memberId,
  );
  const attendance = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM attendance WHERE member_id = ?',
    memberId,
  );
  return {
    ...member,
    payments,
    memberships,
    lifetime_due_amount: roundMoney(memberships.reduce((sum, membership) => sum + membership.due_amount, 0)),
    attendance_count: attendance?.count ?? 0,
    snapshot_date: todayIso(),
    snapshot_status: !member.membership_row_id ? 'none' as const
      : member.membership_status === 'cancelled' ? 'cancelled' as const
        : member.membership_status === 'frozen' ? 'frozen' as const
          : member.start_date! > todayIso() ? 'upcoming' as const
            : member.end_date! < todayIso() ? 'expired' as const : 'active' as const,
  };
}

export async function createMember(
  db: SQLiteDatabase,
  input: CreateMemberInput,
  options: { inTransaction?: boolean } = {},
) {
  if (!input.name.trim()) throw new Error('Enter a member name.');
  if (!['Male', 'Female', 'Other'].includes(input.gender)) throw new Error('Choose a valid gender.');
  const phone = normalizeMemberPhone(input.phone);
  if (input.dateOfBirth) validateDate(input.dateOfBirth, 'date of birth', false);
  let memberId = 0;
  const write = async (transaction: SQLiteDatabase) => {
    const plan = await transaction.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ? AND active = 1', input.planId);
    if (!plan) throw new Error('The selected plan is no longer active.');
    const { discount, admissionFee, totalAmount, payment, paymentDate } = membershipAmounts(input, plan);
    const endDate = addMonths(input.joiningDate, plan.duration_months);
    await assertUniquePhone(transaction, phone);
    const nextId = await transaction.getFirstAsync<{ next_id: number }>(
      'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM members',
    );
    const membershipCode = `PF-${String(nextId?.next_id ?? 1).padStart(4, '0')}`;
    const memberResult = await transaction.runAsync(
      `INSERT INTO members
       (membership_id, name, gender, phone, email, date_of_birth, address, notes, photo_uri, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      membershipCode,
      input.name.trim(),
      input.gender,
      phone,
      input.email?.trim() || null,
      input.dateOfBirth || null,
      input.address?.trim() || null,
      input.notes?.trim() || null,
      input.photoUri || null,
      input.joiningDate,
    );
    memberId = Number(memberResult.lastInsertRowId);

    const membershipResult = await transaction.runAsync(
      `INSERT INTO memberships
       (member_id, plan_id, plan_name, start_date, end_date, base_amount, discount_amount, admission_fee, total_amount, paid_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      memberId,
      plan.id,
      plan.name,
      input.joiningDate,
      endDate,
      plan.amount,
      discount,
      admissionFee,
      totalAmount,
      payment,
    );

    if (payment > 0) {
      await transaction.runAsync(
        `INSERT INTO payments(member_id, membership_id, amount, method, paid_at, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        memberId,
        Number(membershipResult.lastInsertRowId),
        payment,
        input.paymentMethod,
        paymentDate,
        'Initial payment',
      );
    }
  };
  if (options.inTransaction) await write(db);
  else await db.withExclusiveTransactionAsync(write);
  return memberId;
}

export async function updateMemberProfile(
  db: SQLiteDatabase,
  memberId: number,
  input: UpdateMemberInput,
) {
  if (!input.name.trim()) throw new Error('Enter a member name.');
  if (!['Male', 'Female', 'Other'].includes(input.gender)) throw new Error('Choose a valid gender.');
  validateDate(input.joinedAt, 'joining date');
  if (input.dateOfBirth) validateDate(input.dateOfBirth, 'date of birth', false);
  const phone = normalizeMemberPhone(input.phone);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await assertUniquePhone(transaction, phone, memberId);
    const result = await transaction.runAsync(
      `UPDATE members
       SET name = ?, gender = ?, phone = ?, email = ?, date_of_birth = ?, address = ?,
         notes = ?, photo_uri = ?, joined_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.name.trim(),
      input.gender,
      phone,
      input.email?.trim() || null,
      input.dateOfBirth || null,
      input.address?.trim() || null,
      input.notes?.trim() || null,
      input.photoUri || null,
      input.joinedAt,
      memberId,
    );
    if (result.changes === 0) throw new Error('Member not found.');

    // joined_at is profile metadata. A profile edit must never alter purchased access.
  });
}

export async function createMembership(db: SQLiteDatabase, input: CreateMembershipInput) {
  let membershipId = 0;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const member = await transaction.getFirstAsync<{ id: number }>('SELECT id FROM members WHERE id = ?', input.memberId);
    const plan = await transaction.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ? AND active = 1', input.planId);
    const current = await transaction.getFirstAsync<{ id: number; end_date: string; status: string }>(
      `SELECT id, end_date, status FROM memberships
       WHERE member_id = ? ORDER BY start_date DESC, id DESC LIMIT 1`,
      input.memberId,
    );
    if (!member) throw new Error('Member not found.');
    if (!plan) throw new Error('The selected plan is no longer active.');
    if (current?.status === 'active' && current.end_date >= todayIso()) {
      throw new Error('This member already has an active membership. Cancel it before assigning another plan.');
    }
    const { discount, admissionFee, totalAmount, payment, paymentDate } = membershipAmounts(input, plan);
    const endDate = addMonths(input.joiningDate, plan.duration_months);
    if (current?.status === 'active') {
      await transaction.runAsync("UPDATE memberships SET status = 'expired' WHERE id = ?", current.id);
    }
    const result = await transaction.runAsync(
      `INSERT INTO memberships
       (member_id, plan_id, plan_name, start_date, end_date, base_amount, discount_amount, admission_fee, total_amount, paid_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.memberId, plan.id, plan.name, input.joiningDate, endDate,
      plan.amount, discount, admissionFee, totalAmount, payment,
    );
    membershipId = Number(result.lastInsertRowId);
    if (payment > 0) {
      await transaction.runAsync(
        `INSERT INTO payments(member_id, membership_id, amount, method, paid_at, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        input.memberId, membershipId, payment, input.paymentMethod, paymentDate,
        'Membership opening payment',
      );
    }
    await transaction.runAsync(
      "UPDATE members SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      input.memberId,
    );
  });
  return membershipId;
}

export async function changeMembershipPlan(
  db: SQLiteDatabase,
  memberId: number,
  membershipId: number,
  planId: number,
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const [membership, plan] = await Promise.all([
      transaction.getFirstAsync<{
        id: number;
        start_date: string;
        paid_amount: number;
        discount_amount: number;
        admission_fee: number;
        status: string;
      }>(
        `SELECT id, start_date, paid_amount, discount_amount, admission_fee, status
         FROM memberships
         WHERE id = ? AND member_id = ?`,
        membershipId,
        memberId,
      ),
      transaction.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ? AND active = 1', planId),
    ]);

    if (!membership) throw new Error('Membership not found.');
    if (membership.status !== 'active') {
      throw new Error('Only an active membership plan can be changed.');
    }
    if (!plan) throw new Error('The selected plan is no longer active.');

    const discount = Math.max(0, membership.discount_amount || 0);
    const admissionFee = Math.max(0, membership.admission_fee || 0);
    const plannedTotal = roundMoney(Math.max(0, plan.amount - discount + admissionFee));
    const totalAmount = Math.max(plannedTotal, membership.paid_amount);

    const result = await transaction.runAsync(
      `UPDATE memberships
       SET plan_id = ?, plan_name = ?, end_date = ?, base_amount = ?, total_amount = ?
       WHERE id = ? AND member_id = ? AND status = 'active'`,
      plan.id,
      plan.name,
      addMonths(membership.start_date, plan.duration_months),
      plan.amount,
      totalAmount,
      membershipId,
      memberId,
    );
    if (result.changes === 0) throw new Error('This membership is no longer active.');
  });
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
  validateMoney(amount, 'Payment amount', true);
  amount = roundMoney(amount);
  validateDate(paidAt, 'payment date', false);
  validatePaymentMethod(method);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const membership = await transaction.getFirstAsync<{
      total_amount: number; paid_amount: number; status: string;
    }>(
      'SELECT total_amount, paid_amount, status FROM memberships WHERE id = ? AND member_id = ?',
      membershipId, memberId,
    );
    if (!membership) throw new Error('Membership not found.');
    if (!['active', 'expired', 'frozen'].includes(membership.status)) {
      throw new Error('Payments cannot be added to cancelled memberships.');
    }
    const remaining = roundMoney(Math.max(0, membership.total_amount - membership.paid_amount));
    if (amount > remaining) throw new Error(`Payment cannot exceed the remaining ₹${remaining}.`);
    await transaction.runAsync(
      `INSERT INTO payments(member_id, membership_id, amount, method, paid_at, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      memberId, membershipId, amount, method, paidAt, note?.trim() || null,
    );
    await transaction.runAsync(
      'UPDATE memberships SET paid_amount = ROUND(paid_amount + ?, 2) WHERE id = ?',
      amount, membershipId,
    );
  });
}

/**
 * Correct a mistaken entry, not a refund. The positive original remains auditable.
 * Financial views (including historical snapshots) exclude corrected/voided rows.
 */
export async function reversePayment(
  db: SQLiteDatabase,
  memberId: number,
  paymentId: number,
  reason: string,
) {
  if (!reason.trim()) throw new Error('Enter a reason for reversing this payment.');
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const payment = await transaction.getFirstAsync<Payment>(
      'SELECT * FROM payments WHERE id = ? AND member_id = ?', paymentId, memberId,
    );
    if (!payment) throw new Error('Payment not found.');
    if (payment.voided_at) throw new Error('This payment has already been reversed.');
    const adjusted = await transaction.runAsync(
      `UPDATE memberships SET paid_amount = MAX(0, ROUND(paid_amount - ?, 2))
       WHERE id = ? AND member_id = ? AND ROUND(paid_amount, 2) >= ?`,
      payment.amount, payment.membership_id, memberId, payment.amount,
    );
    if (!adjusted.changes) throw new Error('Payment balance is inconsistent; this entry could not be reversed.');
    await transaction.runAsync(
      'UPDATE payments SET voided_at = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL',
      new Date().toISOString(), reason.trim(), paymentId,
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
     SET status = 'cancelled', cancelled_at = ?
     WHERE id = ? AND member_id = ? AND status = 'active'`,
    todayIso(),
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
      SUM(CASE WHEN m.status = 'active' AND ms.status = 'active' AND ms.start_date <= ? AND ms.end_date >= ? THEN 1 ELSE 0 END) AS active_members,
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
    today,
  );
  const finance = await db.getFirstAsync<{ collected: number; due: number }>(
    `SELECT
      COALESCE((SELECT ROUND(SUM(amount), 2) FROM payments WHERE voided_at IS NULL AND paid_at BETWEEN ? AND ?), 0) AS collected,
      COALESCE((SELECT ROUND(SUM(CASE
        WHEN status != 'cancelled' THEN MAX(ROUND(total_amount - paid_amount, 2), 0)
        ELSE 0
      END), 2) FROM memberships), 0) AS due`,
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
    today,
    today,
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
           WHERE ms.member_id = m.id AND ms.status = 'active' AND ms.start_date <= ? AND ms.end_date >= ?
         )) AS active_members,
      COALESCE(ROUND(SUM(CASE WHEN status = 'cancelled' THEN paid_amount ELSE total_amount END), 2), 0) AS total_billed,
      COALESCE((SELECT ROUND(SUM(amount), 2) FROM payments WHERE voided_at IS NULL), 0) AS total_collected,
      COALESCE(ROUND(SUM(CASE
        WHEN status != 'cancelled' THEN MAX(ROUND(total_amount - paid_amount, 2), 0)
        ELSE 0
      END), 2), 0) AS total_due
     FROM memberships`,
    today,
    today,
  );
  const month = await db.getFirstAsync<{ collected: number; expenses: number }>(
    `SELECT
      COALESCE((SELECT ROUND(SUM(amount), 2) FROM payments WHERE voided_at IS NULL AND paid_at BETWEEN ? AND ?), 0) AS collected,
      COALESCE((SELECT ROUND(SUM(amount), 2) FROM expenses WHERE expense_date BETWEEN ? AND ?), 0) AS expenses`,
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
      'SELECT COALESCE(ROUND(SUM(amount), 2), 0) AS amount FROM payments WHERE voided_at IS NULL AND substr(paid_at, 1, 7) = ?',
      key,
    );
    monthlyCollection.push({
      label: date.toLocaleDateString('en-IN', { month: 'short' }),
      amount: total?.amount ?? 0,
    });
  }
  const paymentMethods = await db.getAllAsync<{ method: string; amount: number }>(
    `SELECT method, ROUND(SUM(amount), 2) AS amount
     FROM payments
     WHERE voided_at IS NULL
     GROUP BY method
     ORDER BY amount DESC`,
  );
  const recentPayments = await db.getAllAsync<ReportData['recentPayments'][number]>(
    `SELECT p.*, m.name AS member_name
     FROM payments p
     JOIN members m ON m.id = p.member_id
     WHERE p.voided_at IS NULL
     ORDER BY p.paid_at DESC, p.id DESC
     LIMIT 10`,
  );
  const recentExpenses = await db.getAllAsync<Expense>(
    'SELECT * FROM expenses ORDER BY expense_date DESC, id DESC',
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
    netThisMonth: roundMoney(collectedThisMonth - expensesThisMonth),
    monthlyCollection,
    paymentMethods,
    recentPayments,
    recentExpenses,
  };
}

export async function getPaymentHistory(
  db: SQLiteDatabase,
  filters: PaymentHistoryFilters,
): Promise<PaymentHistoryResult> {
  const query = buildPaymentHistoryQuery(filters);
  const items = await db.getAllAsync<PaymentHistoryItem>(query.sql, ...query.args);
  return {
    items,
    count: items.length,
    total: roundMoney(items.reduce((sum, item) => sum + (item.voided_at ? 0 : item.amount), 0)),
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
  validateMoney(amount, 'Expense amount', true);
  await db.runAsync(
    `INSERT INTO expenses(title, amount, expense_date, category, notes)
     VALUES (?, ?, ?, ?, ?)`,
    title.trim(),
    roundMoney(amount),
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
    gymName: settings.gym_name || '',
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

export type BackupStatus = {
  exportedAt: string;
  filename: string;
};

export type BackupDataHealth = {
  duplicatePhoneGroups: number;
  duplicatePhoneMembers: number;
};

export async function getBackupDataHealth(db: SQLiteDatabase): Promise<BackupDataHealth> {
  const duplicatePhones = await db.getFirstAsync<{
    duplicate_phone_groups: number;
    duplicate_phone_members: number | null;
  }>(`
    SELECT COUNT(*) AS duplicate_phone_groups,
      COALESCE(SUM(member_count), 0) AS duplicate_phone_members
    FROM (
      SELECT COUNT(*) AS member_count
      FROM members
      GROUP BY phone
      HAVING COUNT(*) > 1
    )
  `);
  return {
    duplicatePhoneGroups: duplicatePhones?.duplicate_phone_groups ?? 0,
    duplicatePhoneMembers: duplicatePhones?.duplicate_phone_members ?? 0,
  };
}

export async function getBackupStatus(db: SQLiteDatabase): Promise<BackupStatus> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('last_backup_at', 'last_backup_file')",
  );
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    exportedAt: settings.last_backup_at || '',
    filename: settings.last_backup_file || '',
  };
}

export async function saveBackupStatus(db: SQLiteDatabase, exportedAt: string, filename: string) {
  const entries = [
    ['last_backup_at', exportedAt],
    ['last_backup_file', filename],
  ];
  await db.withTransactionAsync(async () => {
    for (const [key, value] of entries) {
      await db.runAsync(
        'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
    }
  });
}
