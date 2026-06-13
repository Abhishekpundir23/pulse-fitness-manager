import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, LoadingView, PrimaryButton, Screen, Section, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { exportBackup, restoreBackup } from '@/lib/backup';
import {
  createPlan,
  getAllPlans,
  getGymProfile,
  saveGymProfile,
  setPlanActive,
  updatePlan,
} from '@/lib/database';
import { formatCurrency } from '@/lib/format';
import { palette, radii } from '@/lib/theme';
import type { GymProfile, Plan } from '@/lib/types';

const EMPTY_PROFILE: GymProfile = { gymName: '', ownerName: '', phone: '', email: '', address: '' };

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const [profile, setProfile] = useState<GymProfile | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planDuration, setPlanDuration] = useState('');
  const [planPrice, setPlanPrice] = useState('');
  const [planSaving, setPlanSaving] = useState(false);

  const load = useCallback(async () => {
    const [nextProfile, nextPlans] = await Promise.all([getGymProfile(db), getAllPlans(db)]);
    setProfile(nextProfile);
    setPlans(nextPlans);
  }, [db]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const updateProfile = (key: keyof GymProfile, value: string) => {
    setProfile((current) => ({ ...(current ?? EMPTY_PROFILE), [key]: value }));
  };

  const saveProfile = async () => {
    if (!profile?.gymName.trim()) {
      Alert.alert('Gym name required', 'Enter the gym name before saving.');
      return;
    }
    setSaving(true);
    try {
      await saveGymProfile(db, profile);
      refreshData();
      Alert.alert('Saved', 'Gym profile updated.');
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openPlanEditor = (plan?: Plan) => {
    setEditingPlan(plan ?? null);
    setPlanName(plan?.name ?? '');
    setPlanDuration(plan ? String(plan.duration_months) : '');
    setPlanPrice(plan ? String(plan.amount) : '');
    setPlanEditorOpen(true);
  };

  const savePlan = async () => {
    const duration = Number(planDuration);
    const amount = Number(planPrice.replace(/,/g, ''));
    setPlanSaving(true);
    try {
      if (editingPlan) {
        await updatePlan(db, editingPlan.id, planName, duration, amount);
      } else {
        await createPlan(db, planName, duration, amount);
      }
      await load();
      refreshData();
      setPlanEditorOpen(false);
      Alert.alert(
        editingPlan ? 'Plan updated' : 'Plan created',
        'The plan is ready for future memberships. Existing invoices remain unchanged.',
      );
    } catch (error) {
      Alert.alert('Could not save plan', error instanceof Error ? error.message : 'Please check the plan details.');
    } finally {
      setPlanSaving(false);
    }
  };

  const togglePlan = (plan: Plan) => {
    const activating = plan.active === 0;
    Alert.alert(
      activating ? 'Reactivate this plan?' : 'Deactivate this plan?',
      activating
        ? 'The plan will become available when adding or renewing memberships.'
        : 'The plan will be hidden from future memberships. Existing member records remain unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: activating ? 'Reactivate' : 'Deactivate',
          style: activating ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await setPlanActive(db, plan.id, activating);
              await load();
              refreshData();
            } catch (error) {
              Alert.alert('Could not update plan', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const exportData = async () => {
    setBackupBusy(true);
    try {
      await exportBackup(db);
    } catch (error) {
      Alert.alert('Backup failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBackupBusy(false);
    }
  };

  const confirmRestore = () => {
    Alert.alert(
      'Restore a backup?',
      'This replaces all current members, plans, payments, attendance, expenses, and settings on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose backup',
          style: 'destructive',
          onPress: async () => {
            setBackupBusy(true);
            try {
              const exportedAt = await restoreBackup(db);
              if (exportedAt) {
                refreshData();
                await load();
                Alert.alert('Backup restored', 'All local gym records were restored successfully.');
              }
            } catch (error) {
              Alert.alert('Restore failed', error instanceof Error ? error.message : 'Please choose a valid backup.');
            } finally {
              setBackupBusy(false);
            }
          },
        },
      ],
    );
  };

  if (!profile) return <Screen><LoadingView /></Screen>;

  return (
    <Screen>
      <TopBar eyebrow="Local-first administration" title="Your gym" subtitle="Profile, plans, and secure backups" />

      <Section title="Gym profile" subtitle="Used throughout the app and on invoices">
        <FormField label="Gym name" icon="business-outline" value={profile.gymName} onChangeText={(value) => updateProfile('gymName', value)} />
        <FormField label="Owner / manager" icon="person-outline" value={profile.ownerName} onChangeText={(value) => updateProfile('ownerName', value)} />
        <FormField label="Phone" icon="call-outline" value={profile.phone} keyboardType="phone-pad" onChangeText={(value) => updateProfile('phone', value)} />
        <FormField label="Email" icon="mail-outline" value={profile.email} keyboardType="email-address" autoCapitalize="none" onChangeText={(value) => updateProfile('email', value)} />
        <FormField label="Address" icon="location-outline" value={profile.address} multiline onChangeText={(value) => updateProfile('address', value)} />
        <PrimaryButton label="Save gym profile" icon="checkmark" loading={saving} onPress={saveProfile} />
      </Section>

      <Section
        title="Membership plans"
        subtitle="Create, edit, or retire plans without changing old invoices"
        action={
          <Pressable onPress={() => openPlanEditor()} style={styles.addPlanButton}>
            <Ionicons name="add" size={18} color={palette.white} />
            <Text style={styles.addPlanText}>Add plan</Text>
          </Pressable>
        }>
        {plans.map((plan) => (
          <View key={plan.id} style={[styles.planRow, plan.active === 0 && styles.inactivePlan]}>
            <View style={[styles.planIcon, plan.active === 0 && styles.inactiveIcon]}>
              <Ionicons name="barbell" size={19} color={plan.active ? palette.emeraldDark : palette.muted} />
            </View>
            <View style={styles.planCopy}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planMeta}>{plan.duration_months} month access · {plan.active ? 'Active' : 'Inactive'}</Text>
            </View>
            <Text style={styles.planAmount}>{formatCurrency(plan.amount)}</Text>
            <Pressable accessibilityLabel={`Edit ${plan.name}`} onPress={() => openPlanEditor(plan)} style={styles.iconButton}>
              <Ionicons name="pencil" size={16} color={palette.emeraldDark} />
            </Pressable>
            <Pressable accessibilityLabel={`${plan.active ? 'Deactivate' : 'Reactivate'} ${plan.name}`} onPress={() => togglePlan(plan)} style={[styles.iconButton, plan.active === 0 && styles.reactivateButton]}>
              <Ionicons name={plan.active ? 'eye-off-outline' : 'refresh'} size={17} color={plan.active ? palette.red : palette.blue} />
            </Pressable>
          </View>
        ))}
      </Section>

      <Section title="Backup & restore" subtitle="Your records stay on this device unless you export them">
        <View style={styles.backupNotice}>
          <Ionicons name="shield-checkmark" size={24} color={palette.emeraldDark} />
          <Text style={styles.backupNoticeText}>Backups include members, plans, payments, attendance, expenses, and gym profile data.</Text>
        </View>
        <ActionRow icon="cloud-upload-outline" title="Export to Drive" meta="Create a dated JSON backup and choose Google Drive" onPress={exportData} disabled={backupBusy} />
        <ActionRow icon="cloud-download-outline" title="Restore from backup" meta="Import a backup from Drive or device storage" onPress={confirmRestore} disabled={backupBusy} />
      </Section>

      <View style={styles.localBadge}>
        <Ionicons name="phone-portrait-outline" size={18} color={palette.emeraldDark} />
        <Text style={styles.localBadgeText}>Private by default · Local SQLite storage</Text>
      </View>

      <Modal animationType="fade" transparent visible={planEditorOpen} onRequestClose={() => setPlanEditorOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPlanEditorOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>{editingPlan ? 'Edit membership plan' : 'New membership plan'}</Text>
                <Text style={styles.modalTitle}>{editingPlan?.name ?? 'Create a plan'}</Text>
              </View>
              <Pressable onPress={() => setPlanEditorOpen(false)} style={styles.modalClose}>
                <Ionicons name="close" size={21} color={palette.inkSoft} />
              </Pressable>
            </View>
            <FormField label="Plan name" icon="barbell-outline" value={planName} onChangeText={setPlanName} placeholder="e.g. Student Quarterly" />
            <FormField label="Duration in months" icon="calendar-outline" value={planDuration} onChangeText={setPlanDuration} keyboardType="number-pad" placeholder="3" />
            <FormField label="Price in rupees" icon="cash-outline" value={planPrice} onChangeText={setPlanPrice} keyboardType="numeric" placeholder="1600" />
            <PrimaryButton label={editingPlan ? 'Save plan changes' : 'Create membership plan'} icon="checkmark" loading={planSaving} onPress={savePlan} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function ActionRow({ icon, title, meta, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; title: string; meta: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.actionRow}>
      <View style={styles.actionIcon}><Ionicons name={icon} size={22} color={palette.emeraldDark} /></View>
      <View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionMeta}>{meta}</Text></View>
      <Ionicons name="chevron-forward" size={20} color={palette.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addPlanButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: palette.emeraldDark },
  addPlanText: { color: palette.white, fontSize: 11, fontWeight: '800' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.line },
  inactivePlan: { opacity: 0.62 },
  planIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.emeraldSoft, alignItems: 'center', justifyContent: 'center' },
  inactiveIcon: { backgroundColor: palette.canvas },
  planCopy: { flex: 1 },
  planName: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  planMeta: { color: palette.muted, fontSize: 10, marginTop: 3 },
  planAmount: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  iconButton: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.emeraldSoft },
  reactivateButton: { backgroundColor: palette.blueSoft },
  backupNotice: { flexDirection: 'row', gap: 11, padding: 14, borderRadius: radii.md, backgroundColor: palette.emeraldSoft, marginBottom: 8 },
  backupNoticeText: { flex: 1, color: palette.emeraldDark, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: palette.line },
  actionIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.emeraldSoft },
  actionCopy: { flex: 1 },
  actionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  actionMeta: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  localBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10 },
  localBadgeText: { color: palette.emeraldDark, fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(11,19,32,0.58)' },
  modalCard: { backgroundColor: palette.card, borderRadius: radii.xl, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalEyebrow: { color: palette.emeraldDark, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  modalTitle: { color: palette.ink, fontSize: 23, fontWeight: '900', marginTop: 5 },
  modalClose: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
});
