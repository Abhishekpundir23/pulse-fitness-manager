import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  BACKUP_APP,
  BACKUP_TABLES,
  parseBackupArchive,
  serializeBackup,
  summarizeBackup,
  validateBackupArchive,
  type BackupArchive,
  type BackupRow,
  type BackupSummary,
  type BackupTable,
} from '@/lib/backup-archive';
import {
  replaceDatabaseRows,
  restorePhotosIndependently,
  type RestoreTransactionHandle,
} from '@/lib/backup-restore';

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

function databaseLocation(databasePath: string) {
  const separator = databasePath.lastIndexOf('/');
  if (separator === -1) return { databaseName: databasePath, directory: undefined };
  return {
    databaseName: databasePath.slice(separator + 1),
    directory: databasePath.slice(0, separator),
  };
}

async function replaceRowsOnIsolatedConnection(db: SQLiteDatabase, archive: BackupArchive) {
  const { databaseName, directory } = databaseLocation(db.databasePath);
  const isolated = await openDatabaseAsync(
    databaseName,
    { ...db.options, useNewConnection: true },
    directory,
  );
  const transaction: RestoreTransactionHandle = {
    execAsync: (source) => isolated.execAsync(source),
    getFirstAsync: (source) => isolated.getFirstAsync<{ foreign_keys: number }>(source),
    runAsync: (source, values) => isolated.runAsync(source, values),
  };
  try {
    await replaceDatabaseRows(transaction, archive);
  } finally {
    await isolated.closeAsync();
  }
}

async function restoreMemberPhotos(db: SQLiteDatabase, archive: BackupArchive) {
  return restorePhotosIndependently(
    Object.entries(archive.memberPhotos ?? {}),
    async ([memberId, photo]) => {
      let file: File | null = null;
      try {
        const directory = new Directory(Paths.document, 'member-photos');
        if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
        file = new File(directory, `restored-${memberId}-${Date.now()}.${photo.extension}`);
        file.create({ overwrite: true });
        file.write(photo.data, { encoding: 'base64' });
        await db.runAsync('UPDATE members SET photo_uri = ? WHERE id = ?', file.uri, Number(memberId));
      } catch (error) {
        try {
          if (file?.exists) file.delete();
        } catch {
          // Photo cleanup must not prevent the remaining photos from being restored.
        }
        throw error;
      }
    },
  );
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

  await replaceRowsOnIsolatedConnection(db, archive);

  const skippedPhotos = await restoreMemberPhotos(db, archive);
  return { exportedAt: archive.exportedAt, summary, skippedPhotos };
}
