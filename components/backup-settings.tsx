import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Section } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import {
  applyPreparedRestore, chooseBackup, listRecoveryBackups, prepareBackup, prepareRecoveryRestore,
  savePreparedBackup, sharePreparedBackup, shareRecoveryBackup,
  type PreparedBackup, type PreparedRestore, type RecoveryEntry,
} from '@/lib/backup';
import { getBackupAgeReminder, getMissingBackupPhotos } from '@/lib/backup-safety';
import { getBackupDataHealth, getBackupStatus, saveBackupStatus, type BackupDataHealth, type BackupStatus } from '@/lib/database';
import { palette, radii } from '@/lib/theme';

export function BackupSettings({ onRestored }: { onRestored?: () => void | Promise<void> }) {
  if (Platform.OS === 'web') return <Section title="Backup & restore" subtitle="Available in the Android app"><Text style={styles.body}>Use the installed app to export your records, review backups and recover previous data.</Text></Section>;
  return <NativeBackupSettings onRestored={onRestored} />;
}

function NativeBackupSettings({ onRestored }: { onRestored?: () => void | Promise<void> }) {
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState<BackupStatus>({ exportedAt: '', filename: '' });
  const [health, setHealth] = useState<BackupDataHealth>({ duplicatePhoneGroups: 0, duplicatePhoneMembers: 0 });
  const [recoveries, setRecoveries] = useState<RecoveryEntry[]>([]);
  const [showRecoveries, setShowRecoveries] = useState(false);
  const [pending, setPending] = useState<PreparedRestore | null>(null);

  const load = useCallback(async () => {
    const [nextStatus, nextHealth, copies] = await Promise.all([
      getBackupStatus(db), getBackupDataHealth(db), listRecoveryBackups(),
    ]);
    setStatus(nextStatus);
    setHealth(nextHealth);
    setRecoveries(copies);
    setLoadError('');
  }, [db]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load().catch((error) => setLoadError(message(error))).finally(() => setLoading(false));
  }, [load]));

  const begin = () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  };
  const finish = () => { busyRef.current = false; setBusy(false); };
  const reload = async () => { await load().catch((error) => setLoadError(message(error))); };

  const deliver = async (prepared: PreparedBackup, destination: 'folder' | 'share') => {
    let folderSaved = false;
    try {
      if (destination === 'folder') {
        await savePreparedBackup(prepared);
        folderSaved = true;
        await saveBackupStatus(db, prepared.archive.exportedAt, prepared.filename);
        setStatus({ exportedAt: prepared.archive.exportedAt, filename: prepared.filename });
        Alert.alert('Folder backup verified', `${prepared.filename}\n\nThe saved file was read back and checked. Keep a copy off this phone too.`);
      } else {
        await sharePreparedBackup(prepared);
        Alert.alert('Share sheet closed', 'The app cannot verify whether the destination saved your file. Check the destination app. Your verified folder-backup date has not changed.');
      }
    } catch (error) {
      Alert.alert(folderSaved ? 'Folder backup verified' : 'Backup not completed', folderSaved
        ? 'The file was saved and checked, but its backup history could not be updated.'
        : isCancellation(error) ? 'No folder backup was saved.' : message(error));
    } finally {
      discard(prepared);
      finish();
    }
  };

  const exportData = async () => {
    if (!begin()) return;
    try {
      const prepared = await prepareBackup(db);
      const missingPhotos = getMissingBackupPhotos(prepared.archive);
      Alert.alert('Backup ready', `${prepared.summary.members} members · ${prepared.summary.payments} payments${missingPhotos ? `\n\n${missingPhotos} profile photo(s) could not be found or read on this phone and are not included. The member and payment records are included.` : ''}\n\nChoose a folder for a verified saved copy, or share the file to another app.`, [
        { text: 'Cancel', style: 'cancel', onPress: () => { discard(prepared); finish(); } },
        { text: 'Save to folder', onPress: () => { void deliver(prepared, 'folder'); } },
        { text: 'Share file', onPress: () => { void deliver(prepared, 'share'); } },
      ], { cancelable: false });
    } catch (error) {
      Alert.alert('Backup not completed', message(error));
      finish();
    }
  };

  const reviewBackup = async (copy?: RecoveryEntry) => {
    if (!begin()) return;
    try {
      setPending(copy ? await prepareRecoveryRestore(copy) : await chooseBackup());
    } catch (error) {
      Alert.alert('Cannot preview backup', message(error));
    } finally { finish(); }
  };

  const confirmRestore = async () => {
    if (!pending || !begin()) return;
    try {
      const restored = await applyPreparedRestore(db, pending, { confirmed: true });
      if (!restored) return;
      setPending(null);
      setShowRecoveries(true);
      refreshData();
      await reload();
      let refreshWarning = '';
      try { await onRestored?.(); } catch { refreshWarning = '\nReopen this screen to refresh the displayed profile and plans.'; }
      Alert.alert('Backup restored', `${restored.summary.members} members · ${restored.summary.payments} payment records\n\nThe previous data is available under Restore previous data.${restored.photoWarning ? `\nSome photos could not be restored (${restored.skippedPhotos}). The member and payment records were restored.` : ''}${refreshWarning}`);
    } catch (error) {
      setPending(null);
      setShowRecoveries(true);
      await reload();
      Alert.alert('Restore did not complete', message(error));
    } finally { finish(); }
  };

  const shareRecovery = async (copy: RecoveryEntry) => {
    if (!begin()) return;
    try {
      await shareRecoveryBackup(copy);
      Alert.alert('Share sheet closed', 'Check the destination app to confirm it saved the recovery file. The original recovery copy is still on this phone.');
    } catch (error) { Alert.alert('Could not share recovery', message(error)); }
    finally { finish(); }
  };

  const reminder = getBackupAgeReminder(status.exportedAt);
  const disabled = busy || loading || !!pending;
  return (
    <Section title="Backup & restore" subtitle="Keep a safe copy of your gym records">
      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={24} color={palette.emeraldDark} />
        <Text style={styles.noticeText}>Includes members, memberships, payments, attendance, expenses, plans, available profile photos and gym details.</Text>
      </View>
      {loading ? <ActivityIndicator accessibilityLabel="Loading backup status" color={palette.emeraldDark} style={styles.loading} /> : loadError ? (
        <View style={styles.warning}>
          <Text style={styles.body}>Backup history could not be loaded: {loadError}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void reload(); }}><Text style={styles.link}>Retry</Text></Pressable>
        </View>
      ) : (
        <View style={[styles.status, reminder.overdue && styles.warning]}>
          <Text style={styles.title}>{status.exportedAt ? `Last recorded folder backup: ${formatDate(status.exportedAt)}` : 'No verified folder backup recorded'}</Text>
          {!!status.filename && <Text style={styles.meta} numberOfLines={2}>{status.filename}</Text>}
          <Text style={styles.body}>{reminder.message}</Text>
          <Text style={styles.meta}>Sharing a file or creating a restore recovery copy does not verify an external backup.</Text>
        </View>
      )}
      {health.duplicatePhoneGroups > 0 && <Text style={styles.body}>{health.duplicatePhoneMembers} older profiles share phone numbers. Backups preserve every profile.</Text>}
      {busy && <View style={styles.busy}><ActivityIndicator color={palette.emeraldDark} /><Text style={styles.body}>Working on your backup. Keep the app open.</Text></View>}
      <Action icon="save-outline" title="Export backup" subtitle="Save a verified folder copy or share a file" onPress={() => { void exportData(); }} disabled={disabled} />
      <Action icon="document-outline" title="Choose backup to restore" subtitle="Preview the gym, date and records before confirming" onPress={() => { void reviewBackup(); }} disabled={disabled} />
      <Action icon="arrow-undo-outline" title="Restore previous data" subtitle={`${recoveries.length} recovery ${recoveries.length === 1 ? 'copy' : 'copies'} on this phone`} onPress={() => setShowRecoveries((value) => !value)} disabled={disabled || recoveries.length === 0} />
      {showRecoveries && recoveries.length > 0 && <View style={styles.recoveryList}>
        <Text style={styles.body}>These copies were saved before earlier restores. Review one to restore it, or share it for safekeeping. They stay on this phone and are lost if the app is uninstalled.</Text>
        {recoveries.map((copy) => (
          <View key={copy.uri} style={styles.recovery}>
            <Text style={styles.title}>{copy.preview?.gymName ?? 'Unverified recovery copy'}</Text>
            <Text style={styles.meta}>{copy.preview ? `${formatDate(copy.preview.exportedAt)} · ${copy.preview.counts.members} members · ${copy.preview.counts.payments} payments` : copy.error}</Text>
            <Text style={styles.meta} numberOfLines={1}>{copy.filename}</Text>
            {copy.preview && <View style={styles.recoveryActions}>
              <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { void reviewBackup(copy); }} style={styles.smallButton}><Text style={styles.link}>Review & restore</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { void shareRecovery(copy); }} style={styles.smallButton}><Text style={styles.link}>Share recovery</Text></Pressable>
            </View>}
          </View>
        ))}
      </View>}
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => { if (!busyRef.current) setPending(null); }}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.heading}>Review this backup</Text>
              <Text style={styles.gymName}>{pending?.preview.gymName}</Text>
              <Text style={styles.body}>Created {pending && formatDate(pending.preview.exportedAt)}</Text>
              <Text style={styles.meta}>{pending?.filename}</Text>
              {pending && <View style={styles.counts}>{Object.entries(pending.preview.counts).map(([label, count]) => <View key={label} style={styles.countRow}><Text style={styles.body}>{label === 'photos' ? 'Profile photos' : label.charAt(0).toUpperCase() + label.slice(1)}</Text><Text style={styles.title}>{count}</Text></View>)}</View>}
              {!!pending?.preview.missingPhotos && <Text style={styles.body}>{pending.preview.missingPhotos} profile photo(s) were not included in this backup and cannot be restored. Their member records are included.</Text>}
              <View style={styles.warning}>
                <Text style={styles.title}>This replaces all current gym records on this phone.</Text>
                <Text style={styles.body}>A verified recovery copy of the current records will be saved first. You can restore or share it afterwards. No records change until you confirm below.</Text>
              </View>
              <PrimaryButton label={pending?.source === 'recovery' ? 'Restore this recovery copy' : 'Restore this backup'} icon="arrow-undo" variant="danger" loading={busy} onPress={() => { void confirmRestore(); }} />
              <PrimaryButton label="Cancel" variant="secondary" disabled={busy} onPress={() => setPending(null)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Section>
  );
}

function message(error: unknown) { return error instanceof Error ? error.message : 'Please try again.'; }
function isCancellation(error: unknown) { return error instanceof Error && /cancel(?:led|ed)/i.test(error.message); }
function formatDate(value: string) { return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
function discard(prepared: PreparedBackup) { try { if (prepared.file.exists) prepared.file.delete(); } catch { /* Cache cleanup must not hide the actual result. */ } }
function Action({ icon, title, subtitle, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}>
    <Ionicons name={icon} size={23} color={palette.emeraldDark} /><View style={styles.actionCopy}><Text style={styles.title}>{title}</Text><Text style={styles.meta}>{subtitle}</Text></View><Ionicons name="chevron-forward" size={18} color={palette.muted} />
  </Pressable>;
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: palette.emeraldSoft, borderRadius: radii.md },
  noticeText: { flex: 1, color: palette.emeraldDark, fontSize: 12, lineHeight: 18 },
  status: { paddingVertical: 14, gap: 5 },
  warning: { padding: 14, marginVertical: 10, gap: 6, borderRadius: radii.md, backgroundColor: palette.amberSoft },
  title: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  body: { color: palette.inkSoft, fontSize: 12, lineHeight: 18 },
  meta: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  link: { color: palette.emeraldDark, fontSize: 12, fontWeight: '800' },
  loading: { marginVertical: 18 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10 },
  action: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.line },
  actionCopy: { flex: 1 },
  disabled: { opacity: 0.5 },
  recoveryList: { gap: 10, paddingTop: 14 },
  recovery: { padding: 12, backgroundColor: palette.canvas, borderRadius: radii.sm },
  recoveryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  smallButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(11,19,32,0.6)' },
  modalCard: { backgroundColor: palette.card, borderRadius: radii.lg, maxHeight: '90%' },
  modalContent: { padding: 20, gap: 12 },
  heading: { fontSize: 22, color: palette.ink, fontWeight: '900' },
  gymName: { fontSize: 17, color: palette.emeraldDark, fontWeight: '800' },
  counts: { gap: 7, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
