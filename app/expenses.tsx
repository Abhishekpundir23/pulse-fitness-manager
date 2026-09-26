import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ExpenseEditor } from '@/components/expense-editor';
import { MonthFilter } from '@/components/month-filter';
import { EmptyState, LoadingView, PrimaryButton, Screen, SearchBox, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { deleteExpense } from '@/lib/database';
import { formatCurrency, formatDate, todayIso } from '@/lib/format';
import { currentMonthKey, formatMonthLabel } from '@/lib/history-period';
import { getExpenseLedger, reportPeriod, type ExpenseLedger } from '@/lib/reporting';
import { palette, radii } from '@/lib/theme';
import type { Expense } from '@/lib/types';

function initialMonth(value: string | string[] | undefined) {
  if (typeof value !== 'string') return null;
  try { return reportPeriod(value).month; } catch { return null; }
}

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ month?: string }>();
  const { revision, refreshData } = useAppData();
  const [month, setMonth] = useState<string | null>(() => initialMonth(params.month));
  const [search, setSearch] = useState('');
  const [ledger, setLedger] = useState<ExpenseLedger | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const generation = useRef(0);
  const deletion = useRef<number | null>(null);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setRefreshing(true);
    try {
      const result = await getExpenseLedger(db, { search, month });
      if (generation.current === request) { setLedger(result); setLoadError(''); }
    } catch (error) {
      if (generation.current === request) setLoadError(error instanceof Error ? error.message : 'Please try again.');
    } finally { if (generation.current === request) setRefreshing(false); }
  }, [db, search, month]);
  useFocusEffect(useCallback(() => {
    void revision;
    setLedger(null);
    setLoadError('');
    const timer = setTimeout(() => void load(), search.trim() ? 180 : 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [load, revision, search]));

  const remove = (expense: Expense) => {
    if (deletion.current !== null) return;
    Alert.alert('Delete this expense?', `${expense.title} · ${formatCurrency(expense.amount)}\nThis permanently removes the entry and changes your reports.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete expense', style: 'destructive', onPress: async () => {
        if (deletion.current !== null) return;
        deletion.current = expense.id;
        setDeleting(expense.id);
        try {
          await deleteExpense(db, expense.id);
          refreshData();
          await load();
        } catch (error) {
          Alert.alert('Could not delete expense', error instanceof Error ? error.message : 'Please try again.');
        } finally { deletion.current = null; setDeleting(null); }
      } },
    ]);
  };
  const periodLabel = month ? `${formatMonthLabel(month)}${month === currentMonthKey() ? ` · through ${formatDate(todayIso(), { day: 'numeric', month: 'short' })}` : ''}` : 'All time';
  const emptyState = loadError ? (
    <View style={styles.empty}><EmptyState icon="alert-circle-outline" title="Could not load expenses" message={loadError} /><PrimaryButton label="Try again" onPress={() => void load()} /></View>
  ) : !ledger ? <View style={styles.empty}><LoadingView /></View> : (
    <View style={styles.empty}><EmptyState icon={search || month ? 'search-outline' : 'receipt-outline'} title={search || month ? 'No matching expenses' : 'No expenses yet'} message={search || month ? 'Try another search or choose All time.' : 'Record rent, salaries, equipment and other gym costs.'} /></View>
  );

  return (
    <Screen scroll={false} contentContainerStyle={styles.screen}>
      <FlatList
        data={loadError ? [] : ledger?.items ?? []}
        keyExtractor={(item) => String(item.id)}
        refreshing={refreshing}
        onRefresh={() => void load()}
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        ListHeaderComponent={(
          <>
            <TopBar eyebrow="Gym costs" title="Expense ledger" subtitle="Every expense, with search and monthly totals." />
            <View style={styles.addWrap}><PrimaryButton label="Add expense" icon="add-circle-outline" onPress={() => setExpenseOpen(true)} /></View>
            <SearchBox value={search} onChangeText={setSearch} placeholder="Search title, category or notes" />
            <MonthFilter value={month} onChange={setMonth} allowAllTime />
            <View style={styles.summary}>
              <View style={styles.summaryCopy}><Text style={styles.summaryLabel}>{periodLabel}{search.trim() ? ' · search results' : ''}</Text><Text style={styles.summaryCount}>{loadError ? 'Unavailable' : ledger ? `${ledger.count} expense${ledger.count === 1 ? '' : 's'}` : 'Loading expenses…'}</Text></View>
              <Text style={styles.summaryTotal}>{ledger && !loadError ? formatCurrency(ledger.total) : '—'}</Text>
            </View>
          </>
        )}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.expenseIcon}><Ionicons name="arrow-up-outline" size={18} color={palette.red} /></View>
            <View style={styles.copy}>
              <View style={styles.rowHeading}><Text style={styles.title}>{item.title}</Text><Text style={styles.amount}>{formatCurrency(item.amount)}</Text></View>
              <Text style={styles.meta}>{item.category} · {formatDate(item.expense_date)}</Text>
              {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title} expense`} accessibilityState={{ disabled: deleting !== null }} disabled={deleting !== null} onPress={() => remove(item)} style={styles.deleteButton}>
              <Ionicons name={deleting === item.id ? 'hourglass-outline' : 'trash-outline'} size={18} color={palette.red} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      />
      <ExpenseEditor visible={expenseOpen} onClose={() => setExpenseOpen(false)} onSaved={() => void load()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 0 },
  listContent: { flexGrow: 1, paddingBottom: 32 },
  addWrap: { marginBottom: 16 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.ink, borderRadius: radii.lg, padding: 16, marginBottom: 12 },
  summaryCopy: { flex: 1 },
  summaryLabel: { color: '#BCC7CF', fontSize: 11, fontWeight: '600', lineHeight: 17 },
  summaryCount: { color: palette.white, fontSize: 16, fontWeight: '800', marginTop: 4 },
  summaryTotal: { color: palette.white, fontSize: 21, fontWeight: '800', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  expenseIcon: { width: 32, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.redSoft },
  copy: { flex: 1 },
  rowHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { color: palette.ink, fontSize: 14, fontWeight: '800', flex: 1 },
  amount: { color: palette.red, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  meta: { color: palette.muted, fontSize: 11, marginTop: 5 },
  notes: { color: palette.inkSoft, fontSize: 12, marginTop: 6, lineHeight: 17 },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  empty: { flex: 1, minHeight: 240, justifyContent: 'center', paddingVertical: 20 },
});
