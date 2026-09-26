import { useLocalSearchParams, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Chip,
  DateField,
  EmptyState,
  FormField,
  LoadingView,
  PrimaryButton,
  Screen,
  Section,
} from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { addPayment, getMemberDetail } from '@/lib/database';
import { formatCurrency, formatDate, todayIso } from '@/lib/format';
import { palette, radii } from '@/lib/theme';
import type { MemberDetail, Membership, PaymentMethod } from '@/lib/types';

export default function RecordPaymentScreen() {
  const params = useLocalSearchParams<{ memberId: string; membershipId?: string }>();
  const memberId = Number(params.memberId);
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getMemberDetail(db, memberId).then((value) => {
      if (!active) return;
      setMember(value);
      const eligible = value?.memberships.filter((period) => period.status !== 'cancelled' && period.due_amount > 0) ?? [];
      const selected = eligible.find((period) => period.id === Number(params.membershipId)) ?? eligible[0];
      setSelectedId(selected?.id ?? null);
      setAmount(selected ? String(selected.due_amount) : '');
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Please try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, memberId, params.membershipId]);

  const eligible = member?.memberships.filter((period) => period.status !== 'cancelled' && period.due_amount > 0) ?? [];
  const selected = eligible.find((period) => period.id === selectedId);

  const selectPeriod = (period: Membership) => {
    setSelectedId(period.id);
    setAmount(String(period.due_amount));
  };

  const save = async () => {
    if (savingRef.current) return;
    if (!member || !selected) {
      Alert.alert('Select a membership', 'Choose a membership period with an outstanding balance.');
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > selected.due_amount) {
      Alert.alert('Check the amount', `Enter a positive amount up to ${formatCurrency(selected.due_amount)}.`);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await addPayment(db, member.id, selected.id, numericAmount, method, paidAt, note);
      refreshData();
      router.back();
    } catch (error) {
      Alert.alert('Payment failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) return <Screen><LoadingView /></Screen>;
  if (!member || loadError) return <Screen><EmptyState icon="person-outline" title="Could not load member" message={loadError || 'This member is no longer available.'} /></Screen>;
  if (!selected) return <Screen><EmptyState icon="checkmark-circle-outline" title="No outstanding balance" message="Every available membership period is paid or cancelled." /></Screen>;

  return (
    <Screen>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Selected period balance</Text>
        <Text style={styles.balanceValue}>{formatCurrency(selected.due_amount)}</Text>
        <Text style={styles.balanceMeta}>{member.name} · {selected.plan_name}</Text>
        <Text style={styles.balanceMeta}>All periods: {formatCurrency(member.lifetime_due_amount)} outstanding</Text>
      </View>
      <Section title="Membership period" subtitle="Payments can also settle dues from an expired membership">
        {eligible.map((period) => (
          <Pressable key={period.id} accessibilityRole="radio" accessibilityState={{ checked: selectedId === period.id }} onPress={() => selectPeriod(period)} style={[styles.period, selectedId === period.id && styles.selectedPeriod]}>
            <Text style={styles.periodTitle}>{period.plan_name} · {formatCurrency(period.due_amount)} due</Text>
            <Text style={styles.periodMeta}>{formatDate(period.start_date)} to {formatDate(period.end_date)} · Period #{period.id}</Text>
          </Pressable>
        ))}
      </Section>
      <Section title="Payment details" subtitle="This entry reduces the balance of the selected period only">
        <FormField label="Amount received *" icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Text style={styles.groupLabel}>Payment method</Text>
        <View style={styles.chips}>
          {(['Cash', 'UPI', 'Card', 'Bank transfer'] as PaymentMethod[]).map((item) => (
            <Chip key={item} label={item} selected={method === item} onPress={() => setMethod(item)} />
          ))}
        </View>
        <DateField label="Payment date" value={paidAt} onChange={setPaidAt} maximumDate={new Date()} />
        <FormField label="Comment" icon="chatbox-outline" value={note} onChangeText={setNote} multiline placeholder="Optional note" />
      </Section>
      <PrimaryButton
        label={`Record ${formatCurrency(Number(amount) || 0)}`}
        icon="checkmark-circle"
        loading={saving}
        disabled={selected.due_amount <= 0}
        onPress={save}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { padding: 22, backgroundColor: palette.ink, borderRadius: radii.xl, marginVertical: 12 },
  balanceLabel: { color: '#A8B5C0', fontSize: 12, fontWeight: '700' },
  balanceValue: { color: palette.white, fontSize: 32, fontWeight: '900', marginTop: 5 },
  balanceMeta: { color: '#D4DCE2', fontSize: 13, marginTop: 8 },
  groupLabel: { color: palette.inkSoft, fontWeight: '700', fontSize: 13, marginBottom: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  period: { borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, padding: 14, marginBottom: 8 },
  selectedPeriod: { borderColor: palette.emeraldDark, backgroundColor: palette.emeraldSoft },
  periodTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  periodMeta: { color: palette.inkSoft, fontSize: 12, marginTop: 5 },
});
