import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Chip, DateField, EmptyState, LoadingView, PrimaryButton, Screen, SearchBox, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getAttendanceData, setAttendance, type AttendanceData, type AttendanceFilter } from '@/lib/attendance';
import { formatDate, todayIso } from '@/lib/format';
import { palette, radii, shadows } from '@/lib/theme';
import type { MemberListItem } from '@/lib/types';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Not checked in' },
] as const;

const STATUS_LABELS = {
  active: 'Active', expired: 'Expired', cancelled: 'Cancelled', upcoming: 'Upcoming', frozen: 'Frozen', none: 'No membership',
} as const;

export default function AttendanceScreen() {
  const db = useSQLiteContext();
  const { revision, refreshData } = useAppData();
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(todayIso);
  const [filter, setFilter] = useState<AttendanceFilter>('all');
  const [result, setResult] = useState<{ key: string; data: AttendanceData } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mutationRef = useRef(false);
  const requestRef = useRef(0);
  const key = JSON.stringify([date, search, filter]);
  const data = result?.key === key ? result.data : null;
  const error = failure?.key === key ? failure.message : '';

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const next = await getAttendanceData(db, { date, search, filter });
      if (request !== requestRef.current) return;
      setResult({ key, data: next });
      setFailure(null);
    } catch (cause) {
      if (request !== requestRef.current) return;
      setResult(null);
      setFailure({ key, message: cause instanceof Error ? cause.message : 'Please try again.' });
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [db, date, search, filter, key]);
  const latestLoad = useRef(load);
  latestLoad.current = load;

  useFocusEffect(useCallback(() => {
    void revision;
    setLoading(true);
    const timer = setTimeout(() => { void load(); }, search.trim() ? 180 : 0);
    return () => { clearTimeout(timer); requestRef.current += 1; };
  }, [load, revision, search]));

  const updateAttendance = async (member: MemberListItem) => {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      await setAttendance(db, member.id, date, member.attended_today !== 1);
      refreshData();
      await latestLoad.current();
    } catch (cause) {
      Alert.alert('Could not update attendance', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  const isToday = date === todayIso();
  return (
    <Screen scroll={false} contentContainerStyle={styles.screen}>
      <FlatList
        data={data?.members ?? []}
        keyExtractor={(member) => String(member.id)}
        refreshing={loading && data !== null}
        onRefresh={() => { void load(); }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <>
            <TopBar eyebrow="Daily register" title="Attendance" subtitle={isToday ? 'Today’s check-ins' : `Register for ${formatDate(date)}`} />
            <DateField label="Attendance date" value={date} onChange={setDate} maximumDate={new Date()} />
            {!isToday && <Text style={styles.historyNote}>You are editing a past day. Changes are saved to {formatDate(date)}.</Text>}
            <View style={styles.summary}>
              <View style={styles.summaryIcon}><Ionicons name="pulse" size={24} color={palette.emeraldDark} /></View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryValue}>{data ? data.presentCount : '—'}</Text>
                <Text style={styles.summaryLabel}>{isToday ? 'Total present today' : 'Total present on this day'}</Text>
              </View>
            </View>
            <SearchBox value={search} onChangeText={setSearch} placeholder="Name, phone or member ID" />
            <View style={styles.filters}>
              {FILTERS.map((item) => <Chip key={item.key} label={item.label} selected={filter === item.key} onPress={() => setFilter(item.key)} />)}
            </View>
            {!!data && <Text style={styles.resultCount}>{data.members.length} matching {data.members.length === 1 ? 'member' : 'members'}</Text>}
          </>
        )}
        ListEmptyComponent={error ? (
          <EmptyState icon="alert-circle-outline" title="Could not load attendance" message={error} action={<PrimaryButton label="Try again" onPress={() => { void load(); }} />} />
        ) : !data ? <LoadingView /> : (
          <EmptyState icon="checkmark-done-outline" title="No matching members" message={search || filter !== 'all' ? 'Try another search or attendance filter.' : isToday ? 'Add a member to start recording check-ins.' : 'No members were listed on this date.'} />
        )}
        renderItem={({ item: member }) => {
          const present = member.attended_today === 1;
          const status = member.status === 'blocked' ? 'Blocked' : STATUS_LABELS[member.snapshot_status];
          return (
            <View style={styles.row}>
              <Avatar name={member.name} uri={member.photo_uri} size={46} />
              <View style={styles.rowCopy}>
                <Text style={styles.name}>{member.name}</Text>
                <Text style={styles.meta}>{member.membership_id} · {status}</Text>
                <Text style={styles.meta}>{member.plan_name ?? 'No plan'}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${present ? 'Remove check-in for' : 'Check in'} ${member.name} on ${formatDate(date)}`}
                accessibilityState={{ disabled: busy, selected: present }}
                disabled={busy}
                onPress={() => { void updateAttendance(member); }}
                style={({ pressed }) => [styles.checkButton, present && styles.checkButtonPresent, busy && styles.disabled, pressed && styles.pressed]}>
                <Ionicons name={present ? 'checkmark' : 'add'} size={20} color={present ? palette.white : palette.emeraldDark} />
                <Text style={[styles.checkText, present && styles.checkTextPresent]}>{present ? 'Present' : 'Check in'}</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  listContent: { flexGrow: 1, paddingBottom: 32 },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.emeraldSoft, borderRadius: radii.lg, padding: 17, marginBottom: 16 },
  summaryIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card, marginRight: 13 },
  summaryCopy: { flex: 1 },
  summaryValue: { color: palette.ink, fontSize: 24, fontWeight: '900' },
  summaryLabel: { color: palette.emeraldDark, fontSize: 12, fontWeight: '700', marginTop: 3 },
  historyNote: { color: palette.inkSoft, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  resultCount: { color: palette.muted, fontSize: 12, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 10, backgroundColor: palette.card, borderRadius: radii.lg, ...shadows.card },
  rowCopy: { flex: 1 },
  name: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  meta: { color: palette.muted, fontSize: 11, marginTop: 4 },
  checkButton: { minHeight: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: palette.emeraldSoft },
  checkButtonPresent: { backgroundColor: palette.emeraldDark },
  checkText: { color: palette.emeraldDark, fontSize: 11, fontWeight: '800' },
  checkTextPresent: { color: palette.white },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
