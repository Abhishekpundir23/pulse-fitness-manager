import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

const BACKUP_TABLES = [
  'settings',
  'plans',
  'members',
  'memberships',
  'payments',
  'attendance',
  'expenses',
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];
type BackupArchive = {
  app: 'Pulse Fitness Manager';
  schemaVersion: 1;
  exportedAt: string;
  data: Record<BackupTable, Record<string, unknown>[]>;
  memberPhotos?: Record<string, { data: string; extension: string }>;
};

const TABLE_COLUMNS: Record<BackupTable, string[]> = {
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
  attendance: [
    'id',
    'member_id',
    'attendance_date',
    'check_in_time',
    'created_at',
  ],
  expenses: [
    'id',
    'title',
    'amount',
    'expense_date',
    'category',
    'notes',
    'created_at',
  ],
};

export async function exportBackup(db: SQLiteDatabase) {
  const data = {} as BackupArchive['data'];
  for (const table of BACKUP_TABLES) {
    data[table] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }
  const memberPhotos: NonNullable<BackupArchive['memberPhotos']> = {};
  for (const member of data.members) {
    const uri = typeof member.photo_uri === 'string' ? member.photo_uri : '';
    if (!uri) continue;
    const photo = new File(uri);
    if (!photo.exists) continue;
    memberPhotos[String(member.id)] = {
      data: await photo.base64(),
      extension: uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase() ?? 'jpg',
    };
  }
  const archive: BackupArchive = {
    app: 'Pulse Fitness Manager',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data,
    memberPhotos,
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = new File(Paths.cache, `pulse-fitness-backup-${stamp}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(archive, null, 2));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Save gym backup to Google Drive',
  });
  return archive.exportedAt;
}

function assertArchive(value: unknown): asserts value is BackupArchive {
  if (!value || typeof value !== 'object') throw new Error('This is not a valid backup file.');
  const archive = value as Partial<BackupArchive>;
  if (archive.app !== 'Pulse Fitness Manager' || archive.schemaVersion !== 1 || !archive.data) {
    throw new Error('This backup is not compatible with this app version.');
  }
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(archive.data[table])) {
      throw new Error(`Backup data is missing the ${table} table.`);
    }
  }
}

async function insertRows(
  db: SQLiteDatabase,
  table: BackupTable,
  rows: Record<string, unknown>[],
) {
  const columns = TABLE_COLUMNS[table];
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  for (const row of rows) {
    await db.runAsync(sql, columns.map((column) => {
      const value = row[column];
      return value === undefined ? null : value as string | number | null;
    }));
  }
}

async function restoreMemberPhotos(db: SQLiteDatabase, archive: BackupArchive) {
  if (!archive.memberPhotos) return;
  const directory = new Directory(Paths.document, 'member-photos');
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  for (const [memberId, photo] of Object.entries(archive.memberPhotos)) {
    const file = new File(directory, `restored-${memberId}-${Date.now()}.${photo.extension}`);
    file.create({ overwrite: true });
    file.write(photo.data, { encoding: 'base64' });
    await db.runAsync('UPDATE members SET photo_uri = ? WHERE id = ?', file.uri, Number(memberId));
  }
}

export async function restoreBackup(db: SQLiteDatabase) {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;

  const file = new File(result.assets[0].uri);
  const parsed: unknown = JSON.parse(await file.text());
  assertArchive(parsed);

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        DELETE FROM attendance;
        DELETE FROM payments;
        DELETE FROM memberships;
        DELETE FROM members;
        DELETE FROM expenses;
        DELETE FROM plans;
        DELETE FROM settings;
      `);
      for (const table of BACKUP_TABLES) {
        await insertRows(db, table, parsed.data[table]);
      }
      await restoreMemberPhotos(db, parsed);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  return parsed.exportedAt;
}
