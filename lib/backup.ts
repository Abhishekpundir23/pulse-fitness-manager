import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

import {
  BACKUP_APP,
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLES,
  parseBackupArchive,
  serializeBackup,
  summarizeBackup,
  validateBackupArchive,
  type BackupArchive,
  type BackupRow,
  type BackupTable,
} from '@/lib/backup-archive';
import {
  replaceDatabaseRows,
  restorePhotosIndependently,
  type RestoreTransactionHandle,
} from '@/lib/backup-restore';
import {
  previewArchive,
  runRestoreWithRecovery,
  verifyArchiveCopy,
  type BackupPreview,
  type RecoveryCopy,
  type SafeRestoreResult,
} from '@/lib/backup-safety';

export type PreparedBackup = {
  file: File;
  archive: BackupArchive;
  filename: string;
  summary: ReturnType<typeof summarizeBackup>;
};

export type RestoreResult = SafeRestoreResult;
export type PreparedRestore = {
  archive: BackupArchive;
  filename: string;
  preview: BackupPreview;
  source: 'file' | 'recovery';
};
export type RecoveryEntry = RecoveryCopy & { preview?: BackupPreview; error?: string };

async function collectMemberPhotos(rows: BackupRow[]) {
  const memberPhotos: NonNullable<BackupArchive['memberPhotos']> = {};
  for (const member of rows) {
    const uri = typeof member.photo_uri === 'string' ? member.photo_uri : '';
    if (!uri) continue;
    try {
      const photo = new File(uri);
      if (!photo.exists) continue;
      const data = await photo.base64();
      if (!data) continue;
      memberPhotos[String(member.id)] = {
        data,
        extension: uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase() ?? 'jpg',
      };
    } catch {
      // An unavailable optional image must not block backing up gym records.
      // Keep the original row's photo_uri so the preview discloses its omission.
    }
  }
  return memberPhotos;
}

async function collectArchive(db: SQLiteDatabase): Promise<BackupArchive> {
  const data = {} as Record<BackupTable, BackupRow[]>;
  for (const table of BACKUP_TABLES) {
    data[table] = await db.getAllAsync<BackupRow>(`SELECT * FROM ${table}`);
  }

  const exportedAt = new Date().toISOString();
  return validateBackupArchive({
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    data,
    memberPhotos: await collectMemberPhotos(data.members),
  });
}

export async function prepareBackup(db: SQLiteDatabase): Promise<PreparedBackup> {
  const archive = await onIsolatedConnection(db, async (isolated) => {
    await isolated.execAsync('BEGIN;');
    try {
      const snapshot = await collectArchive(isolated);
      await isolated.execAsync('COMMIT;');
      return snapshot;
    } catch (error) {
      await isolated.execAsync('ROLLBACK;');
      throw error;
    }
  });
  const exportedAt = archive.exportedAt;
  const filename = `pulse-fitness-backup-${exportedAt.replace(/[:.]/g, '-')}.json`;
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(serializeBackup(archive));

  const verifiedArchive = verifyArchiveCopy(await file.text(), archive);
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
  try {
    destination.write(serialized);
    verifyArchiveCopy(await destination.text(), prepared.archive);
  } catch (error) {
    try {
      destination.delete();
    } catch {
      // A provider may revoke access or go offline. Keep the original failure
      // visible even when its incomplete destination cannot be removed.
    }
    throw error;
  }
  return destination.uri;
}

export async function sharePreparedBackup(prepared: PreparedBackup): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device.');
  }
  verifyArchiveCopy(await prepared.file.text(), prepared.archive);
  // Android resolves when the chooser returns, before the receiving app is
  // guaranteed to read the FileProvider URI. Give it a separate cache copy that
  // survives the caller discarding the prepared file. The OS manages this cache.
  const directory = new Directory(Paths.cache, 'backup-share');
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  const sharedFile = new File(directory, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${prepared.filename}`);
  prepared.file.copy(sharedFile);
  verifyArchiveCopy(await sharedFile.text(), prepared.archive);
  await Sharing.shareAsync(sharedFile.uri, {
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

async function onIsolatedConnection<T>(db: SQLiteDatabase, work: (isolated: SQLiteDatabase) => Promise<T>): Promise<T> {
  const { databaseName, directory } = databaseLocation(db.databasePath);
  const isolated = await openDatabaseAsync(
    databaseName,
    { ...db.options, useNewConnection: true },
    directory,
  );
  try {
    return await work(isolated);
  } finally {
    await isolated.closeAsync();
  }
}

async function replaceRowsOnIsolatedConnection(
  db: SQLiteDatabase,
  archive: BackupArchive,
  preserveCurrent: (current: BackupArchive) => Promise<void>,
) {
  return onIsolatedConnection(db, async (isolated) => {
    const transaction: RestoreTransactionHandle = {
      execAsync: (source) => isolated.execAsync(source),
      getFirstAsync: (source) => isolated.getFirstAsync<{ foreign_keys: number }>(source),
      runAsync: (source, values) => isolated.runAsync(source, values),
    };
    await replaceDatabaseRows(transaction, archive, async () => {
      await preserveCurrent(await collectArchive(isolated));
    });
  });
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

export async function chooseBackup(): Promise<PreparedRestore | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;

  const file = new File(result.assets[0].uri);
  const archive = parseBackupArchive(await file.text());
  return { archive, filename: result.assets[0].name, preview: previewArchive(archive), source: 'file' };
}

function recoveryDirectory() { return new Directory(Paths.document, 'backup-recovery'); }

async function writeRecovery(serialized: string): Promise<RecoveryCopy> {
  const directory = recoveryDirectory();
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  const filename = `recovery-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 10)}.json`;
  const file = new File(directory, filename);
  // Never overwrite an earlier safety copy, including during undo. Keep files
  // even on failure so a failed transaction or interrupted restore is recoverable.
  file.create({ overwrite: false });
  file.write(serialized);
  return { uri: file.uri, filename };
}

export async function applyPreparedRestore(
  db: SQLiteDatabase,
  prepared: PreparedRestore,
  confirmation: { confirmed: true },
): Promise<RestoreResult | null> {
  return runRestoreWithRecovery(prepared.archive, {
    replaceRows: (archive, preserveCurrent) => replaceRowsOnIsolatedConnection(db, archive, preserveCurrent),
    writeRecovery,
    readRecovery: (copy) => new File(copy.uri).text(),
    restorePhotos: (archive) => restoreMemberPhotos(db, archive),
  }, confirmation?.confirmed === true);
}

export async function listRecoveryBackups(): Promise<RecoveryEntry[]> {
  const directory = recoveryDirectory();
  if (!directory.exists) return [];
  const entries: RecoveryEntry[] = [];
  for (const file of directory.list()) {
    if (!(file instanceof File) || !file.name.endsWith('.json')) continue;
    try {
      const archive = parseBackupArchive(await file.text());
      entries.push({ uri: file.uri, filename: file.name, preview: previewArchive(archive) });
    } catch {
      entries.push({ uri: file.uri, filename: file.name, error: 'This recovery file is incomplete or could not be verified.' });
    }
  }
  return entries.sort((a, b) => b.filename.localeCompare(a.filename));
}

export async function prepareRecoveryRestore(copy: RecoveryCopy): Promise<PreparedRestore> {
  const archive = parseBackupArchive(await new File(copy.uri).text());
  return { archive, filename: copy.filename, preview: previewArchive(archive), source: 'recovery' };
}

export async function shareRecoveryBackup(copy: RecoveryCopy): Promise<void> {
  const prepared = await prepareRecoveryRestore(copy);
  await sharePreparedBackup({
    file: new File(copy.uri), filename: copy.filename,
    archive: prepared.archive, summary: summarizeBackup(prepared.archive),
  });
}

// Compatibility entry point: choosing a file can never replace records without
// a second confirmation that identifies the actual validated archive.
export async function restoreBackup(db: SQLiteDatabase): Promise<RestoreResult | null> {
  const prepared = await chooseBackup();
  if (!prepared) return null;
  const confirmed = await new Promise<boolean>((resolve) => Alert.alert(
    'Replace current gym records?',
    `${prepared.preview.gymName}\nCreated ${prepared.preview.exportedAt}\n${prepared.preview.counts.members} members · ${prepared.preview.counts.payments} payments\n\nA recovery copy of current data will be saved first.`,
    [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Restore this backup', style: 'destructive', onPress: () => resolve(true) }],
    { cancelable: false },
  ));
  return confirmed ? applyPreparedRestore(db, prepared, { confirmed: true }) : null;
}
