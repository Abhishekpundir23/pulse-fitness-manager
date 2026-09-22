import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, FormField, LoadingView, PrimaryButton, Screen, Section, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { BackupSettings } from '@/components/backup-settings';
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
  const { revision, refreshData } = useAppData();
  const profileDirty = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [profile, setProfile] = useState<GymProfile | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planDuration, setPlanDuration] = useState('');
  const [planPrice, setPlanPrice] = useState('');
  const planSavingRef = useRef(false);
  const profileSavingRef = useRef(false);
  const [planSaving, setPlanSaving] = useState(false);

  const load = useCallback(async () => {
    const [nextProfile, nextPlans] = await Promise.all([
      getGymProfile(db),
      getAllPlans(db),
    ]);
    if (!profileDirty.current) setProfile(nextProfile);
    setLoadError('');
    setPlans(nextPlans);
  }, [db]);

  useFocusEffect(useCallback(() => {
    void revision;
    load().catch((error) => setLoadError(error instanceof Error ? error.message : 'Please try again.'));
  }, [load, revision]));

  const updateProfile = (key: keyof GymProfile, value: string) => {
    profileDirty.current = true;
    setProfile((current) => ({ ...(current ?? EMPTY_PROFILE), [key]: value }));
  };

  const saveProfile = async () => {
    if (profileSavingRef.current) return;
    if (!profile?.gymName.trim()) {
      Alert.alert('Gym name required', 'Enter the gym name before saving.');
      return;
    }
    profileSavingRef.current = true;
    setSaving(true);
    try {
      await saveGymProfile(db, profile);
      profileDirty.current = false;
      refreshData();
      Alert.alert('Saved', 'Gym profile updated.');
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      profileSavingRef.current = false;
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
    if (planSavingRef.current) return;
    planSavingRef.current = true;
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
      planSavingRef.current = false;
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

  if (loadError && !profile) return <Screen><Text selectable>{loadError}</Text><PrimaryButton label="Try again" onPress={() => { void load().catch((error) => setLoadError(String(error))); }} /></Screen>;
  if (!profile) return <Screen><LoadingView /></Screen>;

  return (
    <Screen>
      <TopBar eyebrow="Make it yours" title="Your gym" subtitle="Your details, your plans, your prices" />

      <Section title="Gym profile" subtitle="Used throughout the app and on invoices">
        <FormField editable={!saving} label="Gym name" icon="business-outline" value={profile.gymName} onChangeText={(value) => updateProfile('gymName', value)} />
        <FormField editable={!saving} label="Owner / manager" icon="person-outline" value={profile.ownerName} onChangeText={(value) => updateProfile('ownerName', value)} />
        <FormField editable={!saving} label="Phone" icon="call-outline" value={profile.phone} keyboardType="phone-pad" onChangeText={(value) => updateProfile('phone', value)} />
        <FormField editable={!saving} label="Email" icon="mail-outline" value={profile.email} keyboardType="email-address" autoCapitalize="none" onChangeText={(value) => updateProfile('email', value)} />
        <FormField editable={!saving} label="Address" icon="location-outline" value={profile.address} multiline onChangeText={(value) => updateProfile('address', value)} />
        <PrimaryButton label="Save gym profile" icon="checkmark" loading={saving} onPress={saveProfile} />
      </Section>

      <Section
        title="Membership plans"
        subtitle="Choose any name, number of months and price. Changes apply to future memberships."
        action={
          <Pressable onPress={() => openPlanEditor()} style={styles.addPlanButton}>
            <Ionicons name="add" size={18} color={palette.white} />
            <Text style={styles.addPlanText}>Add plan</Text>
          </Pressable>
        }>
        {plans.length === 0 && (
          <EmptyState icon="barbell-outline" title="Add your first plan" message="You decide what your gym offers. Create a plan with your own name, duration and price." action={<PrimaryButton label="Create my first plan" icon="add" onPress={() => openPlanEditor()} />} />
        )}
        {plans.length > 0 && !plans.some((plan) => plan.active) && (
          <Text style={styles.setupHint}>All plans are inactive. Reactivate a plan or create one before adding a membership.</Text>
        )}
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

      <Section title="Import your members" subtitle="Bring an existing list from a CSV spreadsheet">
        <Text style={styles.setupHint}>Create your plans first, then preview the member list and opening balances before importing.</Text>
        <PrimaryButton label="Import member list" icon="people-outline" variant="secondary" disabled={!plans.some((plan) => plan.active)} onPress={() => router.push('/import-members')} />
      </Section>

      <BackupSettings onRestored={async () => { profileDirty.current = false; await load(); }} />

      <View style={styles.localBadge}>
        <Ionicons name="phone-portrait-outline" size={18} color={palette.emeraldDark} />
        <Text style={styles.localBadgeText}>Private by default · Local SQLite storage</Text>
      </View>

      <Modal animationType="fade" transparent visible={planEditorOpen} onRequestClose={() => { if (!planSaving) setPlanEditorOpen(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} disabled={planSaving} onPress={() => setPlanEditorOpen(false)} />
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>{editingPlan ? 'Edit membership plan' : 'New membership plan'}</Text>
                <Text style={styles.modalTitle}>{editingPlan?.name ?? 'Create a plan'}</Text>
              </View>
              <Pressable disabled={planSaving} onPress={() => setPlanEditorOpen(false)} style={styles.modalClose}>
                <Ionicons name="close" size={21} color={palette.inkSoft} />
              </Pressable>
            </View>
            <FormField label="Plan name" icon="barbell-outline" value={planName} onChangeText={setPlanName} placeholder="e.g. Student Quarterly" />
            <FormField label="Duration in months" icon="calendar-outline" value={planDuration} onChangeText={setPlanDuration} keyboardType="number-pad" placeholder="3" />
            <FormField label="Price in rupees" icon="cash-outline" value={planPrice} onChangeText={setPlanPrice} keyboardType="numeric" placeholder="1600" />
            <PrimaryButton label={editingPlan ? 'Save plan changes' : 'Create membership plan'} icon="checkmark" loading={planSaving} onPress={savePlan} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
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
  setupHint: { color: palette.muted, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  localBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10 },
  localBadgeText: { color: palette.emeraldDark, fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(11,19,32,0.58)' },
  modalCard: { maxHeight: '90%', backgroundColor: palette.card, borderRadius: radii.xl, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalEyebrow: { color: palette.emeraldDark, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  modalTitle: { color: palette.ink, fontSize: 23, fontWeight: '900', marginTop: 5 },
  modalClose: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
});
