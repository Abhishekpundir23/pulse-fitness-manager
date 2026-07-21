import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  BACKUP_APP,
  BACKUP_TABLES,
  TABLE_COLUMNS,
  parseBackupArchive,
  serializeBackup,
  summarizeBackup,
  validateBackupArchive,
  type BackupArchive,
  type BackupRow,
  type BackupSummary,
  type BackupTable,
} from '@/lib/backup-archive';

export type PreparedBackup = {
  file: File;
  archive: BackupArchive;
  filename: string;
  summary: BackupSummary;
};

export type RestoreResult = {
  exportedAt: string;
  summary: BackupSummary;
  skippedPhotos: number;
};

function verifySerializedArchive(serialized: string, expected: BackupArchive): BackupArchive {
  const verified = parseBackupArchive(serialized);
  if (verified.app !== expected.app || verified.exportedAt !== expected.exportedAt) {
    throw new Error('Backup verification failed: archive identity changed after writing.');
  }
  for (const table of BACKUP_TABLES) {
    if (verified.data[table].length !== expected.data[table].length) {
      throw new Error(`Backup verification failed: ${table} row count changed after writing.`);
    }
  }
  return verified;
}

async function collectMemberPhotos(rows: BackupRow[]) {
  const memberPhotos: NonNullable<BackupArchive['memberPhotos']> = {};
  for (const member of rows) {
    const uri = typeof member.photo_uri === 'string' ? member.photo_uri : '';
    if (!uri) continue;
    const photo = new File(uri);
    if (!photo.exists) continue;
    memberPhotos[String(member.id)] = {
      data: await photo.base64(),
      extension: uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase() ?? 'jpg',
    };
  }
  return memberPhotos;
}

export async function prepareBackup(db: SQLiteDatabase): Promise<PreparedBackup> {
  const data = {} as Record<BackupTable, BackupRow[]>;
  for (const table of BACKUP_TABLES) {
    data[table] = await db.getAllAsync<BackupRow>(`SELECT * FROM ${table}`);
  }

  const exportedAt = new Date().toISOString();
  const archive = validateBackupArchive({
    app: BACKUP_APP,
    schemaVersion: 1,
    exportedAt,
    data,
    memberPhotos: await collectMemberPhotos(data.members),
  });
  const filename = `pulse-fitness-backup-${exportedAt.replace(/[:.]/g, '-')}.json`;
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(serializeBackup(archive));

  const verifiedArchive = verifySerializedArchive(await file.text(), archive);
  return {
    file,
    archive: verifiedArchive,
    filename,
    summary: summarizeBackup(verifiedArchive),
  };
}

export async function savePreparedBackup(prepared: PreparedBackup): Promise<string> {
  const directory = await Directory.pickDirectoryAsync();
  const serialized = serializeBackup(prepared.archive);
  const destination = directory.createFile(prepared.filename, 'application/json');
  destination.write(serialized);
  verifySerializedArchive(await destination.text(), prepared.archive);
  return destination.uri;
}

export async function sharePreparedBackup(prepared: PreparedBackup): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device.');
  }
  verifySerializedArchive(await prepared.file.text(), prepared.archive);
  await Sharing.shareAsync(prepared.file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Share gym backup',
  });
}

// Kept until the settings flow moves to the separate prepare and delivery actions.
export async function exportBackup(db: SQLiteDatabase) {
  const prepared = await prepareBackup(db);
  await sharePreparedBackup(prepared);
  return prepared.archive.exportedAt;
}

async function insertRows(
  db: SQLiteDatabase,
  table: BackupTable,
  rows: BackupRow[],
) {
  const columns = TABLE_COLUMNS[table];
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  for (const row of rows) {
    await db.runAsync(
      sql,
      columns.map((column) => {
        const value = row[column];
        return value === undefined ? null : value as string | number | null;
      }),
    );
  }
}

async function restoreMemberPhotos(db: SQLiteDatabase, archive: BackupArchive) {
  let skippedPhotos = 0;
  for (const [memberId, photo] of Object.entries(archive.memberPhotos ?? {})) {
    let file: File | null = null;
    try {
      const directory = new Directory(Paths.document, 'member-photos');
      if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
      file = new File(directory, `restored-${memberId}-${Date.now()}.${photo.extension}`);
      file.create({ overwrite: true });
      file.write(photo.data, { encoding: 'base64' });
      await db.runAsync('UPDATE members SET photo_uri = ? WHERE id = ?', file.uri, Number(memberId));
    } catch {
      skippedPhotos += 1;
      try {
        if (file?.exists) file.delete();
      } catch {
        // Photo cleanup must not prevent the remaining photos from being restored.
      }
      try {
        await db.runAsync('UPDATE members SET photo_uri = NULL WHERE id = ?', Number(memberId));
      } catch {
        // The row restore is already committed; report the skipped photo without masking it.
      }
    }
  }
  return skippedPhotos;
}

export async function restoreBackup(db: SQLiteDatabase): Promise<RestoreResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;

  const file = new File(result.assets[0].uri);
  const archive = parseBackupArchive(await file.text());
  const summary = summarizeBackup(archive);

  await db.execAsync('PRAGMA foreign_keys = ON;');
  const foreignKeys = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error('Restore cannot continue because database foreign keys are disabled.');
  }
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

    await insertRows(db, 'settings', archive.data.settings);
    await insertRows(db, 'plans', archive.data.plans);
    await insertRows(
      db,
      'members',
      archive.data.members.map((member) => ({
        ...member,
        photo_uri: archive.memberPhotos?.[String(member.id)] ? member.photo_uri : null,
      })),
    );
    await insertRows(db, 'expenses', archive.data.expenses);
    await insertRows(db, 'memberships', archive.data.memberships);
    await insertRows(db, 'payments', archive.data.payments);
    await insertRows(db, 'attendance', archive.data.attendance);
  });

  const skippedPhotos = await restoreMemberPhotos(db, archive);
  return { exportedAt: archive.exportedAt, summary, skippedPhotos };
}
