import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, Section } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { formatCurrency, formatDate } from '@/lib/format';
import { MAX_IMPORT_BYTES, MEMBER_CSV_HEADER, type MemberImportPreview } from '@/lib/member-import';
import { getImportPreview, importReviewedMembers } from '@/lib/member-import-store';
import { palette } from '@/lib/theme';

export default function ImportMembersScreen() {
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const [selected, setSelected] = useState<{ csv: string; filename: string; preview: MemberImportPreview } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const perform = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await task(); }
    catch (error) { Alert.alert('Could not complete import', error instanceof Error ? error.message : 'Please try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const shareTemplate = () => perform(async () => {
    if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
    const file = new File(Paths.cache, 'gym-members-template.csv');
    file.create({ overwrite: true });
    file.write(MEMBER_CSV_HEADER);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Save member import template' });
  });

  const chooseFile = () => perform(async () => {
    setSelected(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!/\.csv$/i.test(asset.name)) throw new Error('Export your spreadsheet as CSV before selecting it. Excel workbook files are not supported.');
    const file = new File(asset.uri);
    if ((asset.size ?? file.size) > MAX_IMPORT_BYTES) throw new Error('Choose a CSV smaller than 1 MB.');
    const csv = await file.text();
    setSelected({ csv, filename: asset.name, preview: await getImportPreview(db, csv) });
  });

  const confirmImport = () => {
    if (!selected?.preview.canImport || busyRef.current) return;
    Alert.alert('Add these members?', `Add ${selected.preview.rows.length} members and their opening balances?\n\nReceived: ${formatCurrency(selected.preview.totalPaid)}\nOutstanding: ${formatCurrency(selected.preview.totalDue)}\n\nEach opening payment is dated at the membership start date.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Import members', onPress: () => { void perform(async () => {
        const ids = await importReviewedMembers(db, selected.csv, selected.preview);
        setSelected(null);
        refreshData();
        Alert.alert('Members imported', `${ids.length} members added successfully.`, [
          { text: 'View members', onPress: () => router.replace('/members') },
        ]);
      }); } },
    ]);
  };

  return (
    <Screen>
      <Section title="Bring your member list" subtitle="Import up to 500 members from a CSV spreadsheet">
        {Platform.OS === 'web' && <Text style={styles.copy}>Use the Android app to select files and import members. This browser preview shows the import instructions.</Text>}
        <Text style={styles.copy}>Create your membership plans in Your gym first. Use each plan’s exact name in the plan_name column. Dates use YYYY-MM-DD and amounts use rupees without currency symbols or commas.</Text>
        <Text style={styles.copy}>This adds one membership per new member. paid_amount becomes one opening payment on start_date. To move a complete gym history between phones, use Backup & restore.</Text>
        <View style={styles.actions}>
          <PrimaryButton label="Get blank CSV template" icon="document-outline" variant="secondary" disabled={busy || Platform.OS === 'web'} onPress={shareTemplate} />
          <PrimaryButton label="Choose CSV to preview" icon="folder-open-outline" disabled={Platform.OS === 'web'} loading={busy} onPress={chooseFile} />
        </View>
      </Section>
      {selected && (
        <Section title={selected.filename} subtitle="Nothing is saved until you confirm the import">
          {selected.preview.errors.length > 0 ? (
            <>
              <Text style={styles.errorTitle}>Fix {selected.preview.errors.length} issue{selected.preview.errors.length === 1 ? '' : 's'} and choose the file again</Text>
              {selected.preview.errors.map((error, index) => <Text key={index} selectable style={styles.error}>{error}</Text>)}
            </>
          ) : (
            <>
              <Text selectable style={styles.summary}>{selected.preview.rows.length} members · Billed {formatCurrency(selected.preview.totalBilled)}</Text>
              <Text selectable style={styles.summary}>Received {formatCurrency(selected.preview.totalPaid)} · Due {formatCurrency(selected.preview.totalDue)}</Text>
              {selected.preview.rows.map((row) => (
                <View key={row.rowNumber} style={styles.member}>
                  <Text selectable style={styles.name}>{row.input.name} · {row.input.phone}</Text>
                  <Text style={styles.detail}>{row.planName} · {formatDate(row.input.joiningDate)} – {formatDate(row.endDate)}</Text>
                  <Text style={styles.detail}>Received {formatCurrency(row.input.initialPayment)} · Due {formatCurrency(row.due)}</Text>
                </View>
              ))}
              <PrimaryButton label={`Import ${selected.preview.rows.length} members`} icon="people-outline" loading={busy} onPress={confirmImport} />
            </>
          )}
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.inkSoft, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  actions: { gap: 12 },
  errorTitle: { color: palette.red, fontWeight: '800', fontSize: 15, marginBottom: 12 },
  error: { color: palette.red, fontSize: 13, lineHeight: 20, marginBottom: 10 },
  summary: { color: palette.emeraldDark, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  member: { borderBottomWidth: 1, borderBottomColor: palette.line, paddingVertical: 14, marginBottom: 8 },
  name: { color: palette.ink, fontWeight: '700', fontSize: 14 },
  detail: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
});
