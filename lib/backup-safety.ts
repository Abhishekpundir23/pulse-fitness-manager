import {
  parseBackupArchive, serializeBackup, summarizeBackup, validateBackupArchive,
  type BackupArchive, type BackupSummary,
} from './backup-archive';

export type RecoveryCopy = { uri: string; filename: string };
export type RestoreOperations = {
  replaceRows(archive: BackupArchive, preserveCurrent: (current: BackupArchive) => Promise<void>): Promise<void>;
  writeRecovery(serialized: string): Promise<RecoveryCopy>;
  readRecovery(copy: RecoveryCopy): Promise<string>;
  restorePhotos(archive: BackupArchive): Promise<number>;
};

export type BackupPreview = {
  gymName: string;
  exportedAt: string;
  counts: BackupSummary & { memberships: number; expenses: number; plans: number; photos: number };
  missingPhotos: number;
};

export type SafeRestoreResult = {
  exportedAt: string;
  summary: BackupSummary;
  recovery: RecoveryCopy;
  skippedPhotos: number;
  photoWarning: boolean;
};

export function previewArchive(archive: BackupArchive): BackupPreview {
  return {
    gymName: archive.data.settings.find((row) => row.key === 'gym_name')?.value.trim() || 'Gym name not recorded',
    exportedAt: archive.exportedAt,
    counts: {
      ...summarizeBackup(archive),
      memberships: archive.data.memberships.length,
      expenses: archive.data.expenses.length,
      plans: archive.data.plans.length,
      photos: Object.keys(archive.memberPhotos ?? {}).length,
    },
    missingPhotos: getMissingBackupPhotos(archive),
  };
}

export function getMissingBackupPhotos(archive: BackupArchive): number {
  // Old installations can retain a path after its photo has disappeared. Keep
  // those records exportable, but never mistake a path for backed-up photo bytes.
  return archive.data.members.filter((member) => member.photo_uri
    && !archive.memberPhotos?.[String(member.id)]).length;
}

export function verifyArchiveCopy(serialized: string, expected: BackupArchive): BackupArchive {
  const verified = parseBackupArchive(serialized);
  if (serializeBackup(verified) !== serializeBackup(expected)) {
    throw new Error('Backup verification failed: file contents changed after writing.');
  }
  return verified;
}

export function getBackupAgeReminder(exportedAt: string, now = Date.now()) {
  const savedAt = Date.parse(exportedAt);
  if (!Number.isFinite(savedAt) || savedAt > now) {
    return { overdue: true, ageDays: null, message: 'Save a backup to a folder, then keep a copy off this phone.' };
  }
  const ageDays = Math.floor((now - savedAt) / 86_400_000);
  return {
    overdue: ageDays >= 7,
    ageDays,
    message: ageDays >= 7
      ? `Your last recorded folder backup is ${ageDays} days old. Save a fresh copy.`
      : 'Export regularly, especially after recording payments. Keep a copy off this phone.',
  };
}

export async function runRestoreWithRecovery(
  archive: BackupArchive,
  operations: RestoreOperations,
  confirmed: boolean,
): Promise<SafeRestoreResult | null> {
  if (!confirmed) return null;
  const selected = validateBackupArchive(archive);
  let recovery: RecoveryCopy | undefined;
  try {
    await operations.replaceRows(selected, async (current) => {
      recovery = await operations.writeRecovery(serializeBackup(current));
      verifyArchiveCopy(await operations.readRecovery(recovery), current);
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The restore could not be completed.';
    throw new Error(recovery
      ? `${detail} Any recovery file created has been kept on this phone; review it before retrying.`
      : detail);
  }
  if (!recovery) throw new Error('Restore did not create its required recovery copy.');
  let skippedPhotos = getMissingBackupPhotos(selected);
  let photoWarning = skippedPhotos > 0;
  try {
    skippedPhotos += await operations.restorePhotos(selected);
    photoWarning = skippedPhotos > 0;
  } catch {
    // Row replacement is already committed. A photo failure must not look like a
    // failed database restore or encourage an accidental second replacement.
    skippedPhotos += Object.keys(selected.memberPhotos ?? {}).length;
    photoWarning = true;
  }
  return { exportedAt: selected.exportedAt, summary: summarizeBackup(selected), recovery, skippedPhotos, photoWarning };
}
