import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, FormField, LoadingView, PrimaryButton, Screen, Section } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { createPlan, getAllPlans, setPlanActive, updatePlan } from '@/lib/database';
import { formatCurrency } from '@/lib/format';
import { palette, radii } from '@/lib/theme';
import type { Plan } from '@/lib/types';

export default function PlansScreen() {
  const db = useSQLiteContext();
  const { revision, refreshData } = useAppData();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planDuration, setPlanDuration] = useState('');
  const [planPrice, setPlanPrice] = useState('');
  const planSavingRef = useRef(false);
  const originalEditor = useRef('');
  const [planSaving, setPlanSaving] = useState(false);
  const load = useCallback(async () => {
    setPlans(await getAllPlans(db)); setLoadError('');
  }, [db]);
  useFocusEffect(useCallback(() => { void revision; void load().catch((e) => setLoadError(e instanceof Error ? e.message : 'Please try again.')); }, [load, revision]));
  const openPlanEditor = (plan?: Plan) => {
    originalEditor.current = JSON.stringify([plan?.name ?? '', plan ? String(plan.duration_months) : '', plan ? String(plan.amount) : '']);
    setEditingPlan(plan ?? null);
    setPlanName(plan?.name ?? '');
    setPlanDuration(plan ? String(plan.duration_months) : '');
    setPlanPrice(plan ? String(plan.amount) : '');
    setPlanEditorOpen(true);
  };

  const closePlanEditor = () => {
    if (planSavingRef.current) return;
    if (originalEditor.current === JSON.stringify([planName, planDuration, planPrice])) {
      setPlanEditorOpen(false);
      return;
    }
    Alert.alert('Discard plan changes?', 'Your changes have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard changes', style: 'destructive', onPress: () => setPlanEditorOpen(false) },
    ]);
  };

  const savePlan = async () => {
    if (planSavingRef.current) return;
    if (!planPrice.trim() || !/^\d+(?:\.\d{1,2})?$/.test(planPrice.trim().replace(/,/g, ''))) {
      Alert.alert('Enter a plan price', 'Enter a price in rupees, with up to two decimal places. Enter 0 only for a free plan.');
      return;
    }
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
      setPlanEditorOpen(false);
      refreshData();
      await load().catch((error) => setLoadError(`Plan saved, but the list could not refresh. ${error instanceof Error ? error.message : 'Please try again.'}`));
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

  if (!plans) return <Screen>{loadError ? <EmptyState icon="alert-circle-outline" title="Could not load plans" message={loadError} action={<PrimaryButton label="Try again" onPress={() => { void load().catch((e) => setLoadError(String(e))); }} />} /> : <LoadingView />}</Screen>;
  return <Screen>
    {!!loadError && <Section title="Could not refresh plans"><Text selectable style={{ color: palette.red, marginBottom: 12 }}>{loadError}</Text><PrimaryButton label="Refresh list" variant="secondary" onPress={() => { void load().catch((error) => setLoadError(String(error))); }} /></Section>}
      <Section
        title="Membership plans"
        subtitle="Choose any name, number of months and price. Changes apply to future memberships."
        action={
          <Pressable accessibilityRole="button" accessibilityLabel="Add plan" onPress={() => openPlanEditor()} style={styles.addPlanButton}>
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
            <View style={styles.planIdentity}>
            <View style={[styles.planIcon, plan.active === 0 && styles.inactiveIcon]}>
              <Ionicons name="barbell" size={19} color={plan.active ? palette.emeraldDark : palette.muted} />
            </View>
            <View style={styles.planCopy}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planMeta}>{plan.duration_months} month access · {plan.active ? 'Active' : 'Inactive'}</Text>
            </View>
            </View>
            <View style={styles.planActions}>
            <Text style={styles.planAmount}>{formatCurrency(plan.amount)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${plan.name}`} onPress={() => openPlanEditor(plan)} style={styles.iconButton}>
              <Ionicons name="pencil" size={16} color={palette.emeraldDark} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${plan.active ? 'Deactivate' : 'Reactivate'} ${plan.name}`} onPress={() => togglePlan(plan)} style={[styles.iconButton, plan.active === 0 && styles.reactivateButton]}>
              <Ionicons name={plan.active ? 'eye-off-outline' : 'refresh'} size={17} color={plan.active ? palette.red : palette.blue} />
            </Pressable>
            </View>
          </View>
        ))}
      </Section>

      <Modal animationType="fade" transparent visible={planEditorOpen} onRequestClose={closePlanEditor}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} disabled={planSaving} onPress={closePlanEditor} />
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalEyebrow}>{editingPlan ? 'Edit membership plan' : 'New membership plan'}</Text>
                <Text style={styles.modalTitle}>{editingPlan?.name ?? 'Create a plan'}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close plan editor" disabled={planSaving} onPress={closePlanEditor} style={styles.modalClose}>
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
  </Screen>;
}

const styles = StyleSheet.create({
  addPlanButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: palette.emeraldDark },
  addPlanText: { color: palette.white, fontSize: 13, fontWeight: '700' },
  planRow: { gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  planIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  inactivePlan: { opacity: 0.62 },
  planIcon: { width: 48, height: 48, borderRadius: 13, backgroundColor: palette.emeraldSoft, alignItems: 'center', justifyContent: 'center' },
  inactiveIcon: { backgroundColor: palette.canvas },
  planCopy: { flex: 1 },
  planName: { color: palette.ink, fontSize: 16, fontWeight: '700' },
  planMeta: { color: palette.muted, fontSize: 12, marginTop: 4 },
  planAmount: { color: palette.ink, fontSize: 19, fontWeight: '700', flexGrow: 1, fontVariant: ['tabular-nums'] },
  iconButton: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.emeraldSoft },
  reactivateButton: { backgroundColor: palette.blueSoft },
  setupHint: { color: palette.muted, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  localBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10 },
  localBadgeText: { color: palette.emeraldDark, fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(11,19,32,0.58)' },
  modalCard: { maxHeight: '90%', backgroundColor: palette.card, borderRadius: radii.xl, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalEyebrow: { color: palette.emeraldDark, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  modalTitle: { color: palette.ink, fontSize: 23, fontWeight: '900', marginTop: 5 },
  modalClose: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
});
