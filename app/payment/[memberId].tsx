import { useLocalSearchParams, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  Chip,
  DateField,
  FormField,
  LoadingView,
  PrimaryButton,
  Screen,
  Section,
} from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { addPayment, getMemberDetail } from '@/lib/database';
import { formatCurrency, todayIso } from '@/lib/format';
import { palette, radii } from '@/lib/theme';
import type { MemberDetail, PaymentMethod } from '@/lib/types';

export default function RecordPaymentScreen() {
  const params = useLocalSearchParams<{ memberId: string }>();
  const memberId = Number(params.memberId);
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMemberDetail(db, memberId).then((value) => {
      setMember(value);
      if (value?.due_amount) setAmount(String(value.due_amount));
    });
  }, [db, memberId]);

  const save = async () => {
    if (!member?.membership_row_id || member.membership_status !== 'active') {
      Alert.alert('Membership is not active', 'A payment cannot be added to a cancelled membership.');
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > member.due_amount) {
      Alert.alert('Check the amount', `Enter an amount from ₹1 to ${formatCurrency(member.due_amount)}.`);
      return;
    }
    setSaving(true);
    try {
      await addPayment(db, member.id, member.membership_row_id, numericAmount, method, paidAt, note);
      refreshData();
      router.back();
    } catch (error) {
      Alert.alert('Payment failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!member) return <Screen><LoadingView /></Screen>;

  return (
    <Screen>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Outstanding balance</Text>
        <Text style={styles.balanceValue}>{formatCurrency(member.due_amount)}</Text>
        <Text style={styles.balanceMeta}>{member.name} · {member.plan_name}</Text>
      </View>
      <Section title="Payment details" subtitle="This entry will update the member’s balance immediately">
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
        label={member.membership_status === 'active'
          ? `Record ${formatCurrency(Number(amount) || 0)}`
          : 'Membership cancelled'}
        icon="checkmark-circle"
        loading={saving}
        disabled={member.due_amount <= 0 || member.membership_status !== 'active'}
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
});
