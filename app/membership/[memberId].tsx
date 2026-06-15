import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip, DateField, FormField, LoadingView, PrimaryButton, Screen, Section } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { createMembership, getMemberDetail, getPlans } from '@/lib/database';
import { formatCurrency, todayIso } from '@/lib/format';
import { palette, radii } from '@/lib/theme';
import type { MemberDetail, PaymentMethod, Plan } from '@/lib/types';

export default function NewMembershipScreen() {
  const params = useLocalSearchParams<{ memberId: string }>();
  const memberId = Number(params.memberId);
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [joiningDate, setJoiningDate] = useState(todayIso());
  const [discount, setDiscount] = useState('');
  const [admissionFee, setAdmissionFee] = useState('');
  const [initialPayment, setInitialPayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getMemberDetail(db, memberId), getPlans(db)]).then(([nextMember, nextPlans]) => {
      setMember(nextMember);
      setPlans(nextPlans);
      setPlanId(nextPlans[0]?.id ?? null);
    });
  }, [db, memberId]);

  const selectedPlan = plans?.find((plan) => plan.id === planId);
  const total = useMemo(
    () => Math.max(0, (selectedPlan?.amount ?? 0) - (Number(discount) || 0) + (Number(admissionFee) || 0)),
    [selectedPlan, discount, admissionFee],
  );
  const due = Math.max(0, total - (Number(initialPayment) || 0));

  const save = async () => {
    if (!planId) {
      Alert.alert('Plan required', 'Choose a membership plan.');
      return;
    }
    if ((Number(initialPayment) || 0) > total) {
      Alert.alert('Payment is too high', 'Opening payment cannot exceed the final plan amount.');
      return;
    }
    setSaving(true);
    try {
      await createMembership(db, {
        memberId,
        planId,
        joiningDate,
        discountAmount: Number(discount) || 0,
        admissionFee: Number(admissionFee) || 0,
        initialPayment: Number(initialPayment) || 0,
        paymentMethod,
      });
      refreshData();
      router.back();
    } catch (error) {
      Alert.alert('Could not assign plan', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!member || !plans) return <Screen><LoadingView /></Screen>;

  return (
    <Screen>
      <View style={styles.memberCard}>
        <Text style={styles.memberLabel}>Assigning a new membership to</Text>
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.memberMeta}>{member.membership_id} · Current plan: {member.plan_name ?? 'None'}</Text>
      </View>

      <Section title="Choose plan" subtitle="Only active plans are available">
        <View style={styles.planGrid}>
          {plans.map((plan) => (
            <Pressable
              key={plan.id}
              onPress={() => setPlanId(plan.id)}
              style={[styles.planCard, planId === plan.id && styles.planCardSelected]}>
              <View style={[styles.planRadio, planId === plan.id && styles.planRadioSelected]}>
                {planId === plan.id && <View style={styles.planRadioDot} />}
              </View>
              <View style={styles.planCopy}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planDuration}>{plan.duration_months} month access</Text>
              </View>
              <Text style={styles.planAmount}>{formatCurrency(plan.amount)}</Text>
            </Pressable>
          ))}
        </View>
        <DateField label="Plan start date" value={joiningDate} onChange={setJoiningDate} />
        <View style={styles.twoColumn}>
          <FormField containerStyle={styles.half} label="Discount" icon="pricetag-outline" value={discount} onChangeText={setDiscount} keyboardType="numeric" placeholder="₹0" />
          <FormField containerStyle={styles.half} label="Admission fee" icon="add-circle-outline" value={admissionFee} onChangeText={setAdmissionFee} keyboardType="numeric" placeholder="₹0" />
        </View>
      </Section>

      <Section title="Opening payment" subtitle="Record any amount received with the new plan">
        <FormField label="Amount received" icon="cash-outline" value={initialPayment} onChangeText={setInitialPayment} keyboardType="numeric" placeholder="₹0" />
        <Text style={styles.groupLabel}>Payment method</Text>
        <View style={styles.chipRow}>
          {(['Cash', 'UPI', 'Card', 'Bank transfer'] as PaymentMethod[]).map((item) => (
            <Chip key={item} label={item} selected={paymentMethod === item} onPress={() => setPaymentMethod(item)} />
          ))}
        </View>
        <View style={styles.totalBox}>
          <View>
            <Text style={styles.totalLabel}>Final amount</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
          <View style={styles.totalRight}>
            <Text style={styles.totalLabel}>Balance due</Text>
            <Text style={[styles.totalValue, due > 0 && { color: palette.red }]}>{formatCurrency(due)}</Text>
          </View>
        </View>
      </Section>

      <PrimaryButton label="Assign membership plan" icon="refresh-circle" loading={saving} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  memberCard: { padding: 20, borderRadius: radii.xl, backgroundColor: palette.ink, marginVertical: 12 },
  memberLabel: { color: '#A8B5C0', fontSize: 11, fontWeight: '700' },
  memberName: { color: palette.white, fontSize: 25, fontWeight: '900', marginTop: 5 },
  memberMeta: { color: '#D4DCE2', fontSize: 12, marginTop: 7 },
  planGrid: { gap: 9, marginBottom: 18 },
  planCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, backgroundColor: '#FAFBFC' },
  planCardSelected: { borderColor: palette.emeraldDark, backgroundColor: palette.emeraldSoft },
  planRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  planRadioSelected: { borderColor: palette.emeraldDark },
  planRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.emeraldDark },
  planCopy: { flex: 1 },
  planName: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  planDuration: { color: palette.muted, fontSize: 10, marginTop: 3 },
  planAmount: { color: palette.emeraldDark, fontSize: 15, fontWeight: '900' },
  twoColumn: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  groupLabel: { color: palette.inkSoft, fontWeight: '700', fontSize: 13, marginBottom: 9 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 17 },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderRadius: radii.md, backgroundColor: palette.canvas },
  totalRight: { alignItems: 'flex-end' },
  totalLabel: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  totalValue: { color: palette.ink, fontSize: 19, fontWeight: '900', marginTop: 5 },
});
