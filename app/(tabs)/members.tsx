import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MemberCard } from '@/components/member-card';
import { MonthFilter } from '@/components/month-filter';
import { Chip, EmptyState, LoadingView, PrimaryButton, Screen, SearchBox, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getMembers } from '@/lib/database';
import { formatDate } from '@/lib/format';
import { currentMonthKey, snapshotDateForMonth } from '@/lib/history-period';
import { sortDirectoryMembers, type MemberSort } from '@/lib/member-query';
import { palette, radii, shadows } from '@/lib/theme';
import type { MemberFilter, MemberListItem } from '@/lib/types';

const FILTERS = [
  { key: 'all', label: 'All', icon: 'people-outline' },
  { key: 'active', label: 'Active', icon: 'fitness-outline' },
  { key: 'expiring', label: 'Expiring soon', icon: 'time-outline' },
  { key: 'due', label: 'Dues', icon: 'alert-circle-outline' },
  { key: 'paid', label: 'Paid', icon: 'checkmark-circle-outline' },
  { key: 'expired', label: 'Expired', icon: 'calendar-outline' },
  { key: 'cancelled', label: 'Cancelled', icon: 'close-circle-outline' },
] as const;
const SORTS: { key: MemberSort; label: string }[] = [
  { key: 'recent', label: 'Newest' }, { key: 'name', label: 'Name A–Z' },
  { key: 'expiry', label: 'Expiry date' }, { key: 'due', label: 'Highest dues' },
];
const FILTER_COPY: Record<MemberFilter, { found: string; emptyTitle: string; emptyMessage: string }> = {
  all: { found: 'members', emptyTitle: 'Your members start here', emptyMessage: 'Add a member and choose one of your gym’s plans.' },
  active: { found: 'active members', emptyTitle: 'No active members', emptyMessage: 'Members with active access on the selected date appear here.' },
  expiring: { found: 'members expiring within 7 days', emptyTitle: 'No renewals coming up', emptyMessage: 'Memberships ending within seven days of the selected date appear here.' },
  due: { found: 'members with dues', emptyTitle: 'No pending dues', emptyMessage: 'There are no outstanding membership balances for this view.' },
  paid: { found: 'fully paid members', emptyTitle: 'No fully paid members', emptyMessage: 'Members with a membership and no outstanding balance appear here.' },
  expired: { found: 'expired members', emptyTitle: 'No expired members', emptyMessage: 'Memberships that ended before the selected date appear here.' },
  cancelled: { found: 'cancelled memberships', emptyTitle: 'No cancelled memberships', emptyMessage: 'Cancelled memberships appear here without losing their history.' },
};

function normalizeFilter(value: unknown): MemberFilter {
  const next = Array.isArray(value) ? value[0] : value;
  return FILTERS.some((item) => item.key === next) ? next as MemberFilter : 'all';
}

export default function MembersScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ filter?: string; entry?: string }>();
  const { revision } = useAppData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MemberFilter>(normalizeFilter(params.filter));
  const [sort, setSort] = useState<MemberSort>('recent');
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [members, setMembers] = useState<MemberListItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousQuery = useRef('');
  const snapshotDate = snapshotDateForMonth(monthKey);
  const historical = monthKey !== currentMonthKey();
  const future = monthKey > currentMonthKey();

  const load = useCallback(async (refresh = false) => {
    if (timer.current) clearTimeout(timer.current);
    const current = ++request.current;
    if (refresh) setRefreshing(true);
    try {
      const result = await getMembers(db, search, filter, snapshotDate);
      if (request.current !== current) return;
      setMembers(result);
      setLoadError('');
    } catch (error) {
      if (request.current === current) setLoadError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (request.current === current) setRefreshing(false);
    }
  }, [db, filter, search, snapshotDate]);

  useEffect(() => {
    const next = normalizeFilter(params.filter);
    setSearch('');
    setFilter(next);
    setSort(next === 'expiring' ? 'expiry' : next === 'due' ? 'due' : 'recent');
    setMonthKey(currentMonthKey());
  }, [params.filter, params.entry]);

  useFocusEffect(useCallback(() => {
    void revision;
    const query = `${search}\u0000${filter}\u0000${snapshotDate}`;
    if (previousQuery.current !== query) {
      setMembers(null);
      setLoadError('');
      previousQuery.current = query;
    }
    timer.current = setTimeout(() => { void load(); }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      request.current += 1;
    };
  }, [filter, load, revision, search, snapshotDate]));

  const sortedMembers = useMemo(() => sortDirectoryMembers(members ?? [], sort), [members, sort]);
  const copy = FILTER_COPY[filter];
  const selectFilter = (next: MemberFilter) => {
    setFilter(next);
    if (next === 'expiring') setSort('expiry');
    if (next === 'due') setSort('due');
  };

  return (
    <Screen scroll={false} contentContainerStyle={styles.screen}>
      <FlatList
        data={sortedMembers}
        keyExtractor={(member) => String(member.id)}
        renderItem={({ item }) => <MemberCard member={item} />}
        refreshing={refreshing}
        onRefresh={() => { void load(true); }}
        ListHeaderComponent={(
          <>
            <TopBar eyebrow="Your people" title="Members" subtitle={members ? `${members.length} ${copy.found}` : 'Loading your directory'} />
            <SearchBox value={search} onChangeText={setSearch} placeholder="Name, phone or member ID" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {FILTERS.map((item) => <Chip key={item.key} label={item.label} icon={item.icon} selected={filter === item.key} onPress={() => selectFilter(item.key)} />)}
            </ScrollView>
            <MonthFilter value={monthKey} onChange={(value) => setMonthKey(value ?? currentMonthKey())} />
            <View style={[styles.viewNotice, historical && styles.historyNotice]}>
              <Ionicons name={historical ? 'time-outline' : 'today-outline'} size={18} color={historical ? palette.amber : palette.emeraldDark} />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>{historical ? `${future ? 'Upcoming' : 'History'} · as of ${formatDate(snapshotDate)}` : `Current records · ${formatDate(snapshotDate)}`}</Text>
                {historical && <Text style={styles.noticeText}>{future ? 'Based on records entered so far.' : 'Balances are shown for this date.'} Opening a member shows their current record.</Text>}
              </View>
              {historical && <Pressable accessibilityRole="button" onPress={() => setMonthKey(currentMonthKey())} style={styles.todayButton}><Text style={styles.todayLabel}>Today</Text></Pressable>}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
              <Text style={styles.sortLabel}>Sort</Text>
              {SORTS.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: sort === item.key }} onPress={() => setSort(item.key)} style={[styles.sortButton, sort === item.key && styles.sortSelected]}><Text style={[styles.sortText, sort === item.key && styles.sortTextSelected]}>{item.label}</Text></Pressable>)}
            </ScrollView>
            {!!loadError && <View style={styles.errorCard}><Text selectable style={styles.errorText}>Could not refresh members: {loadError}</Text><PrimaryButton label="Try again" variant="secondary" onPress={() => { void load(true); }} /></View>}
          </>
        )}
        ListEmptyComponent={(
          <View style={styles.emptyWrap}>
            {members === null && !loadError ? <LoadingView /> : !loadError && <EmptyState icon={search ? 'search-outline' : filter === 'due' ? 'wallet-outline' : 'people-outline'} title={search ? 'No matching members' : copy.emptyTitle} message={search ? 'Try a different name, phone number, or member ID.' : copy.emptyMessage} action={!search && filter === 'all' ? <PrimaryButton label="Add first member" icon="person-add-outline" onPress={() => router.push('/member/new')} /> : undefined} />}
          </View>
        )}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Add member" onPress={() => router.push('/member/new')} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
        <Ionicons name="person-add" size={22} color={palette.white} /><Text style={styles.fabText}>Add member</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 0 },
  filterRow: { gap: 8, paddingBottom: 14 },
  listContent: { flexGrow: 1, paddingBottom: 100 },
  emptyWrap: { flex: 1, minHeight: 220, justifyContent: 'center' },
  viewNotice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: radii.md, backgroundColor: palette.emeraldSoft, marginBottom: 8 },
  historyNotice: { backgroundColor: palette.amberSoft },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: palette.inkSoft, fontSize: 13, fontWeight: '700' },
  noticeText: { color: palette.inkSoft, fontSize: 12, lineHeight: 18, marginTop: 3 },
  todayButton: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' },
  todayLabel: { color: palette.emeraldDark, fontSize: 13, fontWeight: '800' },
  sortRow: { alignItems: 'center', gap: 6, paddingBottom: 12 },
  sortLabel: { color: palette.muted, fontSize: 12, fontWeight: '700', marginRight: 4 },
  sortButton: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radii.md },
  sortSelected: { backgroundColor: palette.card },
  sortText: { color: palette.muted, fontSize: 13, fontWeight: '600' },
  sortTextSelected: { color: palette.emeraldDark, fontWeight: '800' },
  errorCard: { padding: 14, gap: 12, borderRadius: radii.md, backgroundColor: palette.redSoft, marginBottom: 12 },
  errorText: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  fab: { position: 'absolute', right: 18, bottom: 18, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 19, borderRadius: radii.md, backgroundColor: palette.emeraldDark, ...shadows.card },
  fabText: { color: palette.white, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
