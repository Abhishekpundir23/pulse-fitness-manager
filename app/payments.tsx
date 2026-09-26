import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { MonthFilter } from '@/components/month-filter';
import { Chip, EmptyState, LoadingView, PrimaryButton, Screen, SearchBox, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getPaymentHistory } from '@/lib/database';
import { formatCurrency, formatDate } from '@/lib/format';
import { palette, radii, shadows } from '@/lib/theme';
import type { PaymentHistoryMethod, PaymentHistoryResult } from '@/lib/types';

const METHODS: PaymentHistoryMethod[] = ['all', 'Cash', 'UPI', 'Card', 'Bank transfer'];

function routeMonth(value?: string | string[]) {
  const month = Array.isArray(value) ? value[0] : value;
  return month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
}

export default function PaymentHistoryScreen() {
  const params = useLocalSearchParams<{ month?: string }>();
  const db = useSQLiteContext();
  const { revision } = useAppData();
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState<string | null>(() => routeMonth(params.month));
  const [method, setMethod] = useState<PaymentHistoryMethod>('all');
  const [result, setResult] = useState<{ key: string; history: PaymentHistoryResult } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);
  const key = JSON.stringify([search, month, method]);
  const history = result?.key === key ? result.history : null;
  const loadError = failure?.key === key ? failure.message : '';

  useEffect(() => { setMonth(routeMonth(params.month)); }, [params.month]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const next = await getPaymentHistory(db, { search, month, method, includeVoided: true });
      if (request !== requestRef.current) return;
      setResult({ key, history: next });
      setFailure(null);
    } catch (error) {
      if (request !== requestRef.current) return;
      setResult(null);
      setFailure({ key, message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [db, method, month, search, key]);

  useFocusEffect(useCallback(() => {
    void revision;
    setLoading(true);
    const timer = setTimeout(() => { void load(); }, search.trim() ? 180 : 0);
    return () => { clearTimeout(timer); requestRef.current += 1; };
  }, [load, revision, search]));

  const emptyState = loadError ? (
    <View style={styles.emptyWrap}><EmptyState icon="alert-circle-outline" title="Could not load payments" message={loadError} action={<PrimaryButton label="Try again" onPress={() => { void load(); }} />} /></View>
  ) : history === null ? (
    <View style={styles.emptyWrap}><LoadingView /></View>
  ) : (
    <View style={styles.emptyWrap}>
      <EmptyState
        icon={search || month || method !== 'all' ? 'search-outline' : 'receipt-outline'}
        title={search || month || method !== 'all' ? 'No matching payments' : 'No payments recorded'}
        message={search || month || method !== 'all'
          ? 'Try another member, month, or payment method.'
          : 'Recorded payments will appear here.'}
      />
    </View>
  );

  return (
    <Screen scroll={false} contentContainerStyle={styles.screen}>
      <FlatList
        data={history?.items ?? []}
        refreshing={loading && history !== null}
        onRefresh={() => { void load(); }}
        keyExtractor={(payment) => String(payment.id)}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.member_name}`}
            onPress={() => router.push(`/member/${item.member_id}`)}
            style={({ pressed }) => [styles.paymentRow, pressed && styles.pressed]}>
            <View style={[styles.paymentIcon, item.voided_at ? styles.voidIcon : null]}>
              <Ionicons name={item.voided_at ? 'return-up-back' : 'arrow-down'} size={17} color={item.voided_at ? palette.red : palette.emeraldDark} />
            </View>
            <View style={styles.paymentCopy}>
              <Text style={styles.paymentName}>{item.member_name}</Text>
              <Text style={styles.paymentMeta}>{item.member_code} · {item.method} · {formatDate(item.paid_at)}</Text>
              <Text style={styles.paymentMeta}>Receipt #{item.id} · Period #{item.membership_id}</Text>
              {!!item.voided_at && <Text style={styles.voidLabel}>Reversed {formatDate(item.voided_at.slice(0, 10))} · {item.void_reason}</Text>}
            </View>
            <Text style={[styles.paymentAmount, item.voided_at ? styles.voidAmount : null]}>{formatCurrency(item.amount)}</Text>
          </Pressable>
        )}
        ListHeaderComponent={(
          <>
            <TopBar
              eyebrow="Collections"
              title="Payment history"
              subtitle={history ? `${history.count} recorded entr${history.count === 1 ? 'y' : 'ies'}, including reversals` : loadError ? 'Payments are unavailable' : 'Loading payments'}
            />
            <SearchBox value={search} onChangeText={setSearch} placeholder="Name, phone or member ID" />
            <MonthFilter value={month} onChange={setMonth} allowAllTime />
            <View style={styles.filterRow}>
              {METHODS.map((item) => (
                <Chip
                  key={item}
                  label={item === 'all' ? 'All methods' : item}
                  selected={method === item}
                  onPress={() => setMethod(item)}
                />
              ))}
            </View>
            {history && <View style={styles.summaryCard}>
              <View>
                <Text style={styles.summaryLabel}>Filtered collection · reversals excluded</Text>
                <Text style={styles.summaryCount}>{history.items.filter((payment) => !payment.voided_at).length} valid payments</Text>
              </View>
              <Text style={styles.summaryTotal}>{formatCurrency(history.total)}</Text>
            </View>}
          </>
        )}
        ListEmptyComponent={emptyState}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 0 },
  listContent: { flexGrow: 1, paddingBottom: 42 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14,
    marginBottom: 6, padding: 18, borderRadius: radii.xl, backgroundColor: palette.ink, ...shadows.card,
  },
  summaryLabel: { color: '#A8B5C0', fontSize: 12, fontWeight: '700' },
  summaryCount: { color: palette.white, fontSize: 16, fontWeight: '800', marginTop: 5 },
  summaryTotal: { color: palette.white, fontSize: 23, fontWeight: '900' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.line },
  paymentIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.emeraldSoft },
  paymentCopy: { flex: 1 },
  paymentName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  paymentMeta: { color: palette.muted, fontSize: 11, marginTop: 4 },
  paymentAmount: { color: palette.emeraldDark, fontSize: 14, fontWeight: '900' },
  emptyWrap: { flex: 1, minHeight: 220, justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  voidIcon: { backgroundColor: palette.redSoft },
  voidLabel: { color: palette.red, fontSize: 11, marginTop: 5, fontWeight: '700' },
  voidAmount: { color: palette.muted, textDecorationLine: 'line-through' },
});
