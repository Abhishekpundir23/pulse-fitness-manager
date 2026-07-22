export const BACKUP_APP = 'Pulse Fitness Manager' as const;
export const BACKUP_SCHEMA_VERSION = 1 as const;

export const BACKUP_TABLES = [
  'settings',
  'plans',
  'members',
  'memberships',
  'payments',
  'attendance',
  'expenses',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, unknown>;

export type SettingsBackupRow = BackupRow & {
  key: string;
  value: string;
};

export type PlanBackupRow = BackupRow & {
  id: number;
  name: string;
  duration_months: number;
  amount: number;
  active: number;
};

export type MemberBackupRow = BackupRow & {
  id: number;
  membership_id: string;
  name: string;
  gender: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  notes: string | null;
  photo_uri: string | null;
  status: string;
  joined_at: string;
  created_at: string;
  updated_at: string;
};

export type MembershipBackupRow = BackupRow & {
  id: number;
  member_id: number;
  plan_id: number;
  start_date: string;
  end_date: string;
  base_amount: number;
  discount_amount: number;
  admission_fee: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  cancelled_at?: string | null;
  created_at: string;
};

export type PaymentBackupRow = BackupRow & {
  id: number;
  member_id: number;
  membership_id: number;
  amount: number;
  method: string;
  paid_at: string;
  note: string | null;
  created_at: string;
};

export type AttendanceBackupRow = BackupRow & {
  id: number;
  member_id: number;
  attendance_date: string;
  check_in_time: string;
  created_at: string;
};

export type ExpenseBackupRow = BackupRow & {
  id: number;
  title: string;
  amount: number;
  expense_date: string;
  category: string;
  notes: string | null;
  created_at: string;
};

export type BackupData = {
  settings: SettingsBackupRow[];
  plans: PlanBackupRow[];
  members: MemberBackupRow[];
  memberships: MembershipBackupRow[];
  payments: PaymentBackupRow[];
  attendance: AttendanceBackupRow[];
  expenses: ExpenseBackupRow[];
};

export type BackupArchive = {
  app: typeof BACKUP_APP;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  data: BackupData;
  memberPhotos?: Record<string, { data: string; extension: string }>;
};

export type BackupSummary = {
  members: number;
  payments: number;
  attendance: number;
};

export const TABLE_COLUMNS: { [Table in BackupTable]: (keyof BackupData[Table][number] & string)[] } = {
  settings: ['key', 'value'],
  plans: ['id', 'name', 'duration_months', 'amount', 'active'],
  members: [
    'id',
    'membership_id',
    'name',
    'gender',
    'phone',
    'email',
    'date_of_birth',
    'address',
    'notes',
    'photo_uri',
    'status',
    'joined_at',
    'created_at',
    'updated_at',
  ],
  memberships: [
    'id',
    'member_id',
    'plan_id',
    'start_date',
    'end_date',
    'base_amount',
    'discount_amount',
    'admission_fee',
    'total_amount',
    'paid_amount',
    'status',
    'cancelled_at',
    'created_at',
  ],
  payments: [
    'id',
    'member_id',
    'membership_id',
    'amount',
    'method',
    'paid_at',
    'note',
    'created_at',
  ],
  attendance: ['id', 'member_id', 'attendance_date', 'check_in_time', 'created_at'],
  expenses: ['id', 'title', 'amount', 'expense_date', 'category', 'notes', 'created_at'],
};

const REQUIRED_STRING_FIELDS: Partial<Record<BackupTable, readonly string[]>> = {
  settings: ['key', 'value'],
  plans: ['name'],
  members: [
    'membership_id',
    'name',
    'gender',
    'phone',
    'status',
    'joined_at',
    'created_at',
    'updated_at',
  ],
  memberships: ['start_date', 'end_date', 'status', 'created_at'],
  payments: ['method', 'paid_at', 'created_at'],
  attendance: ['attendance_date', 'check_in_time', 'created_at'],
  expenses: ['title', 'expense_date', 'category', 'created_at'],
};

const REQUIRED_NUMBER_FIELDS: Partial<Record<BackupTable, readonly string[]>> = {
  plans: ['id', 'duration_months', 'amount', 'active'],
  members: ['id'],
  memberships: [
    'id',
    'member_id',
    'plan_id',
    'base_amount',
    'discount_amount',
    'admission_fee',
    'total_amount',
    'paid_amount',
  ],
  payments: ['id', 'member_id', 'membership_id', 'amount'],
  attendance: ['id', 'member_id'],
  expenses: ['id', 'amount'],
};

const NULLABLE_STRING_FIELDS: Partial<Record<BackupTable, readonly string[]>> = {
  members: ['email', 'date_of_birth', 'address', 'notes', 'photo_uri'],
  payments: ['note'],
  expenses: ['notes'],
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidField(table: BackupTable, rowIndex: number, field: string, expected: string): never {
  throw new Error(`Backup ${table} row ${rowIndex} has an invalid ${field}; expected ${expected}.`);
}

function validateRows(table: BackupTable, rows: unknown[]): asserts rows is BackupData[typeof table] {
  rows.forEach((value, rowIndex) => {
    if (!isObject(value)) {
      throw new Error(`Backup ${table} row ${rowIndex} must be an object.`);
    }

    for (const field of REQUIRED_STRING_FIELDS[table] ?? []) {
      if (typeof value[field] !== 'string') invalidField(table, rowIndex, field, 'a string');
    }
    for (const field of REQUIRED_NUMBER_FIELDS[table] ?? []) {
      if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
        invalidField(table, rowIndex, field, 'a finite number');
      }
    }
    for (const field of NULLABLE_STRING_FIELDS[table] ?? []) {
      if (value[field] !== null && typeof value[field] !== 'string') {
        invalidField(table, rowIndex, field, 'a string or null');
      }
    }

    if ('id' in value && !Number.isSafeInteger(value.id)) {
      invalidField(table, rowIndex, 'id', 'a safe integer');
    }
    if (table === 'plans' && !Number.isInteger(value.duration_months)) {
      invalidField(table, rowIndex, 'duration_months', 'an integer');
    }
    if (table === 'plans' && !Number.isInteger(value.active)) {
      invalidField(table, rowIndex, 'active', 'an integer');
    }
    if (table === 'memberships') {
      if (!Number.isSafeInteger(value.member_id)) {
        invalidField(table, rowIndex, 'member_id', 'a safe integer');
      }
      if (!Number.isSafeInteger(value.plan_id)) {
        invalidField(table, rowIndex, 'plan_id', 'a safe integer');
      }
      if (value.cancelled_at !== undefined
        && value.cancelled_at !== null
        && typeof value.cancelled_at !== 'string') {
        invalidField(table, rowIndex, 'cancelled_at', 'a string, null, or omitted');
      }
    }
    if (table === 'payments') {
      if (!Number.isSafeInteger(value.member_id)) {
        invalidField(table, rowIndex, 'member_id', 'a safe integer');
      }
      if (!Number.isSafeInteger(value.membership_id)) {
        invalidField(table, rowIndex, 'membership_id', 'a safe integer');
      }
    }
    if (table === 'attendance' && !Number.isSafeInteger(value.member_id)) {
      invalidField(table, rowIndex, 'member_id', 'a safe integer');
    }
  });
}

function uniqueValues(
  table: BackupTable,
  rows: BackupRow[],
  field: string,
): Set<string | number> {
  const values = new Set<string | number>();
  for (const row of rows) {
    const value = row[field] as string | number;
    if (values.has(value)) throw new Error(`Backup ${table} table contains a duplicate ${field}.`);
    values.add(value);
  }
  return values;
}

function validateRelationships(data: BackupData) {
  uniqueValues('settings', data.settings, 'key');
  const planIds = uniqueValues('plans', data.plans, 'id');
  const memberIds = uniqueValues('members', data.members, 'id');
  uniqueValues('members', data.members, 'membership_id');
  uniqueValues('members', data.members, 'phone');
  const membershipIds = uniqueValues('memberships', data.memberships, 'id');
  uniqueValues('payments', data.payments, 'id');
  uniqueValues('attendance', data.attendance, 'id');
  uniqueValues('expenses', data.expenses, 'id');

  const membershipOwners = new Map<number, number>();
  for (const membership of data.memberships) {
    if (!memberIds.has(membership.member_id)) {
      throw new Error(`Backup membership ${membership.id} references an unknown member.`);
    }
    if (!planIds.has(membership.plan_id)) {
      throw new Error(`Backup membership ${membership.id} references an unknown plan.`);
    }
    membershipOwners.set(membership.id, membership.member_id);
  }

  for (const payment of data.payments) {
    if (!memberIds.has(payment.member_id)) {
      throw new Error(`Backup payment ${payment.id} references an unknown member.`);
    }
    if (!membershipIds.has(payment.membership_id)) {
      throw new Error(`Backup payment ${payment.id} references an unknown membership.`);
    }
    if (membershipOwners.get(payment.membership_id) !== payment.member_id) {
      throw new Error(
        `Backup payment ${payment.id} membership does not belong to member ${payment.member_id}.`,
      );
    }
  }

  const attendanceKeys = new Set<string>();
  for (const attendance of data.attendance) {
    if (!memberIds.has(attendance.member_id)) {
      throw new Error(`Backup attendance ${attendance.id} references an unknown member.`);
    }
    const uniqueKey = `${attendance.member_id}\u0000${attendance.attendance_date}`;
    if (attendanceKeys.has(uniqueKey)) {
      throw new Error('Backup attendance table contains a duplicate member/date entry.');
    }
    attendanceKeys.add(uniqueKey);
  }

  return memberIds;
}

function validateMemberPhotos(value: unknown, memberIds: Set<string | number>) {
  if (value === undefined) return;
  if (!isObject(value)) throw new Error('Backup member photos must be an object.');

  for (const [memberId, photo] of Object.entries(value)) {
    if (!memberIds.has(Number(memberId)) || String(Number(memberId)) !== memberId) {
      throw new Error(`Backup photo references an unknown member ${memberId}.`);
    }
    if (!isObject(photo)) throw new Error(`Backup photo for member ${memberId} must be an object.`);
    if (typeof photo.data !== 'string' || photo.data.length === 0) {
      throw new Error(`Backup photo data for member ${memberId} must be a non-empty string.`);
    }
    if (typeof photo.extension !== 'string' || !/^[a-zA-Z0-9]+$/.test(photo.extension)) {
      throw new Error(`Backup photo extension for member ${memberId} must be alphanumeric.`);
    }
  }
}

export function validateBackupArchive(value: unknown): BackupArchive {
  if (!isObject(value)) throw new Error('This is not a valid backup file.');
  if (value.app !== BACKUP_APP || value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('This backup is not compatible with this app version.');
  }
  if (typeof value.exportedAt !== 'string' || !value.exportedAt) {
    throw new Error('Backup exportedAt must be a non-empty string.');
  }
  if (!isObject(value.data)) throw new Error('Backup data must be an object.');

  for (const table of BACKUP_TABLES) {
    const rows = value.data[table];
    if (!Array.isArray(rows)) throw new Error(`Backup data is missing the ${table} table.`);
    validateRows(table, rows);
  }

  const data = value.data as BackupData;
  const memberIds = validateRelationships(data);
  validateMemberPhotos(value.memberPhotos, memberIds);
  return value as BackupArchive;
}

export function parseBackupArchive(serialized: string): BackupArchive {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  return validateBackupArchive(parsed);
}

export function summarizeBackup(archive: BackupArchive): BackupSummary {
  return {
    members: archive.data.members.length,
    payments: archive.data.payments.length,
    attendance: archive.data.attendance.length,
  };
}

export function serializeBackup(archive: BackupArchive): string {
  return JSON.stringify(validateBackupArchive(archive), null, 2);
}
