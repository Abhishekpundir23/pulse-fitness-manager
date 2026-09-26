import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField, FormField, PrimaryButton } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { todayIso } from '@/lib/format';
import { saveExpenseEntry, type ExpenseDraft } from '@/lib/reporting';
import { palette, radii } from '@/lib/theme';

const emptyDraft = (): ExpenseDraft => ({ title: '', amount: '', date: todayIso(), category: 'General', notes: '' });

export function ExpenseEditor({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => { if (visible) setDraft(emptyDraft()); }, [visible]);
  const update = (field: keyof ExpenseDraft, value: string) => setDraft((previous) => ({ ...previous, [field]: value }));
  const dismiss = () => { if (!savingRef.current) onClose(); };
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveExpenseEntry(db, draft);
      refreshData();
      onClose();
      onSaved();
    } catch (error) {
      Alert.alert('Could not save expense', error instanceof Error ? error.message : 'Please check the details and try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss expense form" />
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.heading}><Text style={styles.title}>Add expense</Text><Text style={styles.subtitle}>Keep your gym costs up to date.</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close expense form" disabled={saving} onPress={dismiss} style={styles.close}>
              <Ionicons name="close" size={23} color={palette.inkSoft} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
            <FormField label="Expense title" icon="receipt-outline" value={draft.title} onChangeText={(value) => update('title', value)} placeholder="e.g. Electricity bill" editable={!saving} />
            <FormField label="Amount in rupees" icon="cash-outline" value={draft.amount} onChangeText={(value) => update('amount', value)} keyboardType="decimal-pad" placeholder="0.00" editable={!saving} />
            <FormField label="Category" icon="folder-outline" value={draft.category} onChangeText={(value) => update('category', value)} placeholder="General" editable={!saving} />
            <DateField label="Expense date" value={draft.date} onChange={(value) => update('date', value)} maximumDate={new Date()} />
            <FormField label="Notes" icon="document-text-outline" value={draft.notes} onChangeText={(value) => update('notes', value)} multiline placeholder="Optional" editable={!saving} />
            <PrimaryButton label="Save expense" icon="checkmark-circle" loading={saving} onPress={save} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,32,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
  card: { maxHeight: '100%', borderRadius: radii.xl, backgroundColor: palette.card, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 8 },
  heading: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800', color: palette.ink },
  subtitle: { fontSize: 13, color: palette.muted, marginTop: 4 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fields: { paddingHorizontal: 18, paddingBottom: 20 },
});
