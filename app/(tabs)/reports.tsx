import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExpenseEditor } from '@/components/expense-editor';
import { MonthFilter } from '@/components/month-filter';
import { EmptyState, LoadingView, PrimaryButton, Screen, Section, StatCard, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { formatCurrency, formatDate, todayIso } from '@/lib/format';
import { currentMonthKey, formatMonthLabel } from '@/lib/history-period';
import { getMonthlyReport, type MonthlyReport } from '@/lib/reporting';
import { palette, radii } from '@/lib/theme';

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const { revision } = useAppData();
  const [month, setMonth] = useState(currentMonthKey());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setRefreshing(true);
    try {
      const result = await getMonthlyReport(db, month);
      if (request === generation.current) { setReport(result); setLoadError(''); }
    } catch (error) {
      if (request === generation.current) setLoadError(error instanceof Error ? error.message : 'Please try again.');
    } finally { if (request === generation.current) setRefreshing(false); }
  }, [db, month]);
  useFocusEffect(useCallback(() => {
    void revision;
    void load();
    return () => { generation.current += 1; };
  }, [load, revision]));

  const shown = report?.period.month === month ? report : null;
  const maxCollection = Math.max(1, ...(shown?.monthlyCollection.map((item) => item.amount) ?? []));
  const periodLabel = month === currentMonthKey() ? `${formatMonthLabel(month)} · through ${formatDate(todayIso(), { day: 'numeric', month: 'short' })}` : formatMonthLabel(month);
  const openExpenses = () => router.push({ pathname: '/expenses', params: { month } });

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load()}>
      <TopBar eyebrow="Money overview" title="Reports" subtitle="Know what came in and what went out." />
      <MonthFilter value={month} onChange={(value) => value && setMonth(value)} />
      <Text style={styles.period}>{periodLabel}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => setExpenseOpen(true)} style={styles.addExpense}>
          <Ionicons name="add-circle-outline" size={20} color={palette.white} /><Text style={styles.addText}>Add expense</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={openExpenses} style={styles.ledgerButton}>
          <Ionicons name="list-outline" size={20} color={palette.emeraldDark} /><Text style={styles.actionText}>Expense ledger</Text>
        </Pressable>
      </View>
      {loadError ? (
        <Section><EmptyState icon="alert-circle-outline" title="Could not load reports" message={loadError} /><PrimaryButton label="Try again" onPress={() => void load()} /></Section>
      ) : !shown ? <LoadingView /> : (
        <>
          <View style={styles.grid}>
            <StatCard icon="wallet" label="Collected" value={formatCurrency(shown.collected)} onPress={() => router.push({ pathname: '/payments', params: { month } })} />
            <StatCard icon="arrow-up-circle" label="Expenses" value={formatCurrency(shown.expenses)} tone="red" onPress={openExpenses} />
            <StatCard icon="trending-up" label="Net cash flow" value={formatCurrency(shown.net)} tone={shown.net >= 0 ? 'green' : 'red'} />
            <StatCard icon="receipt" label="Current dues · all time" value={formatCurrency(shown.currentDues)} tone="amber" />
          </View>
          <Text style={styles.explanation}>Net cash flow = collected − expenses. Dues are the current unpaid balance across all membership periods.</Text>
          <Section title="Six-month collection" subtitle={`Six months ending ${formatMonthLabel(month)}`}>
            <View style={styles.chart}>
              {shown.monthlyCollection.map((item) => (
                <View key={item.month} style={styles.chartColumn} accessibilityLabel={`${item.label}: ${formatCurrency(item.amount)}`}>
                  <View style={styles.chartTrack}><View style={[styles.chartBar, { height: item.amount ? Math.max(4, (item.amount / maxCollection) * 110) : 0 }]} /></View>
                  <Text style={styles.chartLabel}>{item.label}</Text>
                  <Text style={styles.chartAmount}>{item.amount >= 1000 ? `₹${(item.amount / 1000).toFixed(1)}k` : formatCurrency(item.amount)}</Text>
                </View>
              ))}
            </View>
          </Section>
          <Section title="Payment methods" subtitle={periodLabel}>
            {shown.paymentMethods.length === 0 ? <Text style={styles.muted}>No collections in this period.</Text> : shown.paymentMethods.map((item) => (
              <View key={item.method} style={styles.methodRow}>
                <Text style={styles.methodName}>{item.method}</Text>
                <View style={styles.methodTrack}><View style={[styles.methodBar, { width: `${(item.amount / Math.max(1, shown.collected)) * 100}%` }]} /></View>
                <Text style={styles.methodAmount}>{formatCurrency(item.amount)}</Text>
              </View>
            ))}
          </Section>
          <Section title="Expenses this period" subtitle={`${shown.expenseCount} expense${shown.expenseCount === 1 ? '' : 's'} · ${formatCurrency(shown.expenses)}`}>
            <Text style={styles.muted}>Search every entry, review costs and manage expenses in the ledger.</Text>
            <Pressable accessibilityRole="button" onPress={openExpenses} style={styles.linkRow}><Text style={styles.actionText}>View expense ledger</Text><Ionicons name="arrow-forward" size={18} color={palette.emeraldDark} /></Pressable>
          </Section>
          <Section title="Recent payments" subtitle={`Latest 5 in this period · reversals excluded`} action={(
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/payments', params: { month } })} style={styles.textButton}><Text style={styles.actionText}>View all</Text></Pressable>
          )}>
            {shown.recentPayments.length === 0 ? <Text style={styles.muted}>No payments in this period.</Text> : shown.recentPayments.map((payment) => (
              <Pressable key={payment.id} accessibilityRole="button" accessibilityLabel={`Open ${payment.member_name}`} onPress={() => router.push(`/member/${payment.member_id}`)} style={styles.paymentRow}>
                <View style={styles.paymentIcon}><Ionicons name="arrow-down" size={18} color={palette.emeraldDark} /></View>
                <View style={styles.paymentCopy}><Text style={styles.paymentName}>{payment.member_name}</Text><Text style={styles.paymentMeta}>{payment.method} · {formatDate(payment.paid_at)}</Text></View>
                <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
              </Pressable>
            ))}
          </Section>
        </>
      )}
      <ExpenseEditor visible={expenseOpen} onClose={() => setExpenseOpen(false)} onSaved={() => void load()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  period: { fontSize: 12, fontWeight: '700', color: palette.muted, marginBottom: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  addExpense: { flexGrow: 1, flexDirection: 'row', minHeight: 46, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', gap: 7, borderRadius: radii.md, backgroundColor: palette.emeraldDark },
  addText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  ledgerButton: { flexGrow: 1, flexDirection: 'row', minHeight: 46, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', gap: 7, borderRadius: radii.md, backgroundColor: palette.emeraldSoft },
  actionText: { color: palette.emeraldDark, fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 10 },
  explanation: { color: palette.muted, fontSize: 12, lineHeight: 18, marginBottom: 20 },
  chart: { height: 164, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  chartColumn: { flex: 1, alignItems: 'center' },
  chartTrack: { height: 110, width: 24, borderRadius: 8, backgroundColor: palette.canvas, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: 24, borderRadius: 8, backgroundColor: palette.emerald },
  chartLabel: { color: palette.inkSoft, fontSize: 11, fontWeight: '700', marginTop: 8 },
  chartAmount: { color: palette.muted, fontSize: 9, marginTop: 4 },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  methodName: { width: 86, fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  methodTrack: { flex: 1, height: 7, backgroundColor: palette.canvas, borderRadius: 4, overflow: 'hidden' },
  methodBar: { height: 7, backgroundColor: palette.emerald, borderRadius: 4 },
  methodAmount: { minWidth: 56, textAlign: 'right', color: palette.ink, fontSize: 12, fontWeight: '800' },
  muted: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  linkRow: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 10 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.line },
  paymentIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.emeraldSoft, alignItems: 'center', justifyContent: 'center' },
  paymentCopy: { flex: 1 },
  paymentName: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  paymentMeta: { color: palette.muted, fontSize: 11, marginTop: 4 },
  paymentAmount: { color: palette.emeraldDark, fontSize: 14, fontWeight: '800' },
});
