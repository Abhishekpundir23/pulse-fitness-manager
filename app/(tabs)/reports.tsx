import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField, FormField, LoadingView, PrimaryButton, Screen, Section, StatCard, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { addExpense, deleteExpense, getReportData } from '@/lib/database';
import { formatCurrency, formatDate, todayIso } from '@/lib/format';
import { palette, radii, shadows } from '@/lib/theme';
import type { ReportData } from '@/lib/types';

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const { revision, refreshData } = useAppData();
  const [report, setReport] = useState<ReportData | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('General');
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseSaving, setExpenseSaving] = useState(false);

  const load = useCallback(async () => setReport(await getReportData(db)), [db]);
  useFocusEffect(useCallback(() => {
    void revision;
    load();
  }, [load, revision]));

  const saveExpense = async () => {
    setExpenseSaving(true);
    try {
      await addExpense(db, expenseTitle, Number(expenseAmount), expenseDate, expenseCategory, expenseNotes);
      setExpenseOpen(false);
      setExpenseTitle('');
      setExpenseAmount('');
      setExpenseCategory('General');
      setExpenseNotes('');
      refreshData();
      await load();
    } catch (error) {
      Alert.alert('Could not save expense', error instanceof Error ? error.message : 'Please check the details.');
    } finally {
      setExpenseSaving(false);
    }
  };

  const removeExpense = (id: number, title: string) => {
    Alert.alert('Delete this expense?', `${title} will be permanently removed from reports.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExpense(db, id);
          refreshData();
          await load();
        },
      },
    ]);
  };

  if (!report) return <Screen><LoadingView /></Screen>;
  const maxCollection = Math.max(1, ...report.monthlyCollection.map((item) => item.amount));
  const totalMethods = Math.max(1, report.paymentMethods.reduce((sum, item) => sum + item.amount, 0));

  return (
    <Screen>
      <TopBar
        eyebrow="Financial overview"
        title="Reports"
        subtitle="Collections, dues, and cash flow in rupees"
      />
      <View style={styles.grid}>
        <StatCard icon="wallet" label="Total collected" value={formatCurrency(report.totalCollected)} />
        <StatCard icon="receipt" label="Outstanding dues" value={formatCurrency(report.totalDue)} tone="red" />
        <StatCard icon="calendar" label="This month" value={formatCurrency(report.collectedThisMonth)} tone="blue" />
        <StatCard icon="trending-up" label="Net this month" value={formatCurrency(report.netThisMonth)} tone={report.netThisMonth >= 0 ? 'green' : 'red'} />
      </View>

      <Section title="Six-month collection" subtitle="Payment totals received each month">
        <View style={styles.chart}>
          {report.monthlyCollection.map((item) => (
            <View key={item.label} style={styles.chartColumn}>
              <View style={styles.chartTrack}>
                <View
                  style={[
                    styles.chartBar,
                    { height: Math.max(8, (item.amount / maxCollection) * 112) },
                  ]}
                />
              </View>
              <Text style={styles.chartLabel}>{item.label}</Text>
              <Text style={styles.chartAmount}>
                {item.amount >= 1000 ? `₹${(item.amount / 1000).toFixed(1)}k` : `₹${item.amount}`}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Collection health">
        <View style={styles.healthRow}>
          <View style={[styles.healthIcon, { backgroundColor: palette.blueSoft }]}>
            <Ionicons name="document-text" size={20} color={palette.blue} />
          </View>
          <View style={styles.healthCopy}>
            <Text style={styles.healthLabel}>Total membership value</Text>
            <Text style={styles.healthValue}>{formatCurrency(report.totalBilled)}</Text>
          </View>
        </View>
        <View style={styles.healthRow}>
          <View style={[styles.healthIcon, { backgroundColor: palette.emeraldSoft }]}>
            <Ionicons name="checkmark-done" size={20} color={palette.emeraldDark} />
          </View>
          <View style={styles.healthCopy}>
            <Text style={styles.healthLabel}>Collected</Text>
            <Text style={styles.healthValue}>{formatCurrency(report.totalCollected)}</Text>
          </View>
          <Text style={styles.healthPercent}>
            {report.totalBilled > 0 ? Math.round((report.totalCollected / report.totalBilled) * 100) : 0}%
          </Text>
        </View>
        <View style={styles.healthRow}>
          <View style={[styles.healthIcon, { backgroundColor: palette.redSoft }]}>
            <Ionicons name="alert" size={20} color={palette.red} />
          </View>
          <View style={styles.healthCopy}>
            <Text style={styles.healthLabel}>Yet to collect</Text>
            <Text style={styles.healthValue}>{formatCurrency(report.totalDue)}</Text>
          </View>
        </View>
      </Section>

      <Section title="Payment methods" subtitle="All-time collection split">
        {report.paymentMethods.length === 0 ? (
          <Text style={styles.muted}>Payment method totals will appear after the first payment.</Text>
        ) : (
          report.paymentMethods.map((item) => (
            <View key={item.method} style={styles.methodRow}>
              <Text style={styles.methodName}>{item.method}</Text>
              <View style={styles.methodTrack}>
                <View style={[styles.methodBar, { width: `${(item.amount / totalMethods) * 100}%` }]} />
              </View>
              <Text style={styles.methodAmount}>{formatCurrency(item.amount)}</Text>
            </View>
          ))
        )}
      </Section>

      <Section
        title="Expenses"
        subtitle={`${formatCurrency(report.expensesThisMonth)} recorded this month`}
        action={
          <Pressable onPress={() => setExpenseOpen(true)} style={styles.addExpenseButton}>
            <Ionicons name="add" size={17} color={palette.white} />
            <Text style={styles.addExpenseText}>Add expense</Text>
          </Pressable>
        }>
        {report.recentExpenses.length === 0 ? (
          <Text style={styles.muted}>Add rent, electricity, equipment, salaries, and other costs to calculate the real monthly net.</Text>
        ) : (
          report.recentExpenses.map((expense) => (
            <View key={expense.id} style={styles.paymentRow}>
              <View style={[styles.paymentIcon, { backgroundColor: palette.redSoft }]}>
                <Ionicons name="arrow-up" size={17} color={palette.red} />
              </View>
              <View style={styles.paymentCopy}>
                <Text style={styles.paymentName}>{expense.title}</Text>
                <Text style={styles.paymentMeta}>{expense.category} · {formatDate(expense.expense_date)}</Text>
              </View>
              <Text style={[styles.paymentAmount, { color: palette.red }]}>-{formatCurrency(expense.amount)}</Text>
              <Pressable accessibilityLabel={`Delete ${expense.title} expense`} onPress={() => removeExpense(expense.id, expense.title)} style={styles.deleteExpense}>
                <Ionicons name="trash-outline" size={17} color={palette.red} />
              </Pressable>
            </View>
          ))
        )}
      </Section>

      <Section title="Recent payments">
        {report.recentPayments.length === 0 ? (
          <Text style={styles.muted}>No payments recorded yet.</Text>
        ) : (
          report.recentPayments.map((payment) => (
            <View key={payment.id} style={styles.paymentRow}>
              <View style={styles.paymentIcon}>
                <Ionicons name="arrow-down" size={17} color={palette.emeraldDark} />
              </View>
              <View style={styles.paymentCopy}>
                <Text style={styles.paymentName}>{payment.member_name}</Text>
                <Text style={styles.paymentMeta}>{payment.method} · {formatDate(payment.paid_at)}</Text>
              </View>
              <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
            </View>
          ))
        )}
      </Section>

      <Modal animationType="fade" transparent visible={expenseOpen} onRequestClose={() => setExpenseOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setExpenseOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>Cash flow</Text>
                <Text style={styles.modalTitle}>Add expense</Text>
              </View>
              <Pressable onPress={() => setExpenseOpen(false)} style={styles.modalClose}>
                <Ionicons name="close" size={21} color={palette.inkSoft} />
              </Pressable>
            </View>
            <FormField label="Expense title" icon="receipt-outline" value={expenseTitle} onChangeText={setExpenseTitle} placeholder="e.g. Electricity bill" />
            <FormField label="Amount in rupees" icon="cash-outline" value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="numeric" />
            <FormField label="Category" icon="folder-outline" value={expenseCategory} onChangeText={setExpenseCategory} placeholder="General" />
            <DateField label="Expense date" value={expenseDate} onChange={setExpenseDate} maximumDate={new Date()} />
            <FormField label="Notes" icon="document-text-outline" value={expenseNotes} onChangeText={setExpenseNotes} multiline placeholder="Optional" />
            <PrimaryButton label="Save expense" icon="checkmark-circle" loading={expenseSaving} onPress={saveExpense} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 },
  chart: { height: 172, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  chartColumn: { flex: 1, alignItems: 'center' },
  chartTrack: { height: 116, width: 24, borderRadius: 12, backgroundColor: palette.canvas, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: 24, borderRadius: 12, backgroundColor: palette.emerald },
  chartLabel: { color: palette.inkSoft, fontSize: 11, fontWeight: '700', marginTop: 7 },
  chartAmount: { color: palette.muted, fontSize: 9, marginTop: 3 },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.line },
  healthIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  healthCopy: { flex: 1 },
  healthLabel: { color: palette.muted, fontSize: 12 },
  healthValue: { color: palette.ink, fontSize: 16, fontWeight: '800', marginTop: 3 },
  healthPercent: { color: palette.emeraldDark, fontSize: 15, fontWeight: '900' },
  methodRow: { marginBottom: 15 },
  methodName: { color: palette.inkSoft, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  methodTrack: { height: 8, borderRadius: 4, backgroundColor: palette.canvas, overflow: 'hidden' },
  methodBar: { height: 8, borderRadius: 4, backgroundColor: palette.emerald },
  methodAmount: { color: palette.ink, fontSize: 12, fontWeight: '800', marginTop: 6, alignSelf: 'flex-end' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.line },
  paymentIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.emeraldSoft },
  paymentCopy: { flex: 1 },
  paymentName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  paymentMeta: { color: palette.muted, fontSize: 11, marginTop: 4 },
  paymentAmount: { color: palette.emeraldDark, fontSize: 14, fontWeight: '900' },
  muted: { color: palette.muted, lineHeight: 20, textAlign: 'center', paddingVertical: 16 },
  addExpenseButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, borderRadius: radii.pill, backgroundColor: palette.emeraldDark },
  addExpenseText: { color: palette.white, fontSize: 10, fontWeight: '800' },
  deleteExpense: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.redSoft },
  modalBackdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(11,19,32,0.62)' },
  modalCard: { maxHeight: '90%', padding: 20, borderRadius: radii.xl, backgroundColor: palette.card, ...shadows.card },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  modalEyebrow: { color: palette.emeraldDark, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  modalTitle: { color: palette.ink, fontSize: 23, fontWeight: '900', marginTop: 5 },
  modalClose: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
});
