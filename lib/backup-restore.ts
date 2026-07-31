import {
  TABLE_COLUMNS,
  type BackupArchive,
  type BackupRow,
  type BackupTable,
  type MemberBackupRow,
} from '@/lib/backup-archive';
import {
  CREATE_MEMBER_PHONE_GUARDS_SQL,
  DROP_MEMBER_PHONE_GUARDS_SQL,
} from '@/lib/member-phone-guards';

type RestoreValue = string | number | null;

export type RestoreTransactionHandle = {
  execAsync(source: string): Promise<void>;
  getFirstAsync(source: string): Promise<{ foreign_keys: number } | null>;
  runAsync(source: string, values: RestoreValue[]): Promise<unknown>;
};

export function prepareMembersForRestore(members: MemberBackupRow[]): BackupRow[] {
  return members.map((member) => ({ ...member, photo_uri: null }));
}

async function insertRows(
  transaction: RestoreTransactionHandle,
  table: BackupTable,
  rows: BackupRow[],
) {
  const columns = TABLE_COLUMNS[table];
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  for (const row of rows) {
    await transaction.runAsync(
      sql,
      columns.map((column) => {
        const value = row[column];
        return value === undefined ? null : value as RestoreValue;
      }),
    );
  }
}

export async function replaceDatabaseRows(
  transaction: RestoreTransactionHandle,
  archive: BackupArchive,
) {
  await transaction.execAsync('PRAGMA foreign_keys = ON;');
  const foreignKeys = await transaction.getFirstAsync('PRAGMA foreign_keys;');
  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error('Restore cannot continue because database foreign keys are disabled.');
  }

  await transaction.execAsync('BEGIN IMMEDIATE;');
  try {
    // Older installations may already contain duplicate phone values. Temporarily
    // remove the write guards so a verified backup can restore those rows exactly.
    await transaction.execAsync(DROP_MEMBER_PHONE_GUARDS_SQL);
    await transaction.execAsync(`
      DELETE FROM attendance;
      DELETE FROM payments;
      DELETE FROM memberships;
      DELETE FROM members;
      DELETE FROM expenses;
      DELETE FROM plans;
      DELETE FROM settings;
    `);

    await insertRows(transaction, 'settings', archive.data.settings);
    await insertRows(transaction, 'plans', archive.data.plans);
    await insertRows(transaction, 'members', prepareMembersForRestore(archive.data.members));
    await insertRows(transaction, 'expenses', archive.data.expenses);
    await insertRows(transaction, 'memberships', archive.data.memberships);
    await insertRows(transaction, 'payments', archive.data.payments);
    await insertRows(transaction, 'attendance', archive.data.attendance);
    await transaction.execAsync(CREATE_MEMBER_PHONE_GUARDS_SQL);
    await transaction.execAsync('COMMIT;');
  } catch (error) {
    try {
      await transaction.execAsync('ROLLBACK;');
    } catch {
      // Closing the isolated connection provides the final rollback fallback.
    }
    throw error;
  }
}

export async function restorePhotosIndependently<T>(
  photos: readonly T[],
  restorePhoto: (photo: T) => Promise<void>,
) {
  let skippedPhotos = 0;
  for (const photo of photos) {
    try {
      await restorePhoto(photo);
    } catch {
      skippedPhotos += 1;
    }
  }
  return skippedPhotos;
}
