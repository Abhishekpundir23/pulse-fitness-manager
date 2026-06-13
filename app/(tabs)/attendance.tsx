import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, EmptyState, LoadingView, Screen, SearchBox, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getMembers, toggleAttendance } from '@/lib/database';
import { formatDate, todayIso } from '@/lib/format';
import { palette, radii, shadows } from '@/lib/theme';
import type { MemberListItem } from '@/lib/types';

export default function AttendanceScreen() {
  const db = useSQLiteContext();
  const { revision, refreshData } = useAppData();
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<MemberListItem[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setMembers(await getMembers(db, search));
  }, [db, search]);

  useFocusEffect(useCallback(() => {
    void revision;
    load();
  }, [load, revision]));

  const toggle = async (memberId: number) => {
    setBusyId(memberId);
    await toggleAttendance(db, memberId);
    refreshData();
    await load();
    setBusyId(null);
  };

  const presentCount = members?.filter((member) => member.attended_today === 1).length ?? 0;

  return (
    <Screen scroll={false}>
      <TopBar
        eyebrow={formatDate(todayIso(), { weekday: 'long', day: 'numeric', month: 'long' })}
        title="Attendance"
        subtitle={`${presentCount} checked in today`}
      />
      <View style={styles.summary}>
        <View style={styles.summaryIcon}>
          <Ionicons name="pulse" size={24} color={palette.emeraldDark} />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryValue}>{presentCount}</Text>
          <Text style={styles.summaryLabel}>Members present</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryValue}>{members?.length ?? 0}</Text>
          <Text style={styles.summaryLabel}>Listed members</Text>
        </View>
      </View>
      <SearchBox value={search} onChangeText={setSearch} placeholder="Find a member to check in" />
      <View style={styles.listCard}>
        {members === null ? (
          <LoadingView />
        ) : members.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="No members found"
            message="Add members first, then their daily check-ins will appear here."
          />
        ) : (
          members.map((member) => {
            const present = member.attended_today === 1;
            return (
              <View key={member.id} style={styles.row}>
                <Avatar name={member.name} uri={member.photo_uri} size={48} />
                <View style={styles.rowCopy}>
                  <Text style={styles.name}>{member.name}</Text>
                  <Text style={styles.meta}>{member.membership_id} · {member.plan_name ?? 'No plan'}</Text>
                </View>
                <Pressable
                  disabled={busyId === member.id}
                  onPress={() => toggle(member.id)}
                  style={({ pressed }) => [
                    styles.checkButton,
                    present && styles.checkButtonPresent,
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons
                    name={present ? 'checkmark' : 'add'}
                    size={20}
                    color={present ? palette.white : palette.emeraldDark}
                  />
                  <Text style={[styles.checkText, present && styles.checkTextPresent]}>
                    {present ? 'Present' : 'Check in'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.emeraldSoft,
    borderRadius: radii.lg,
    padding: 17,
    marginBottom: 16,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.card,
    marginRight: 13,
  },
  summaryCopy: { flex: 1 },
  summaryValue: { color: palette.ink, fontSize: 20, fontWeight: '900' },
  summaryLabel: { color: palette.emeraldDark, fontSize: 11, fontWeight: '700', marginTop: 3 },
  summaryDivider: { width: 1, height: 38, backgroundColor: '#B8E8D4', marginHorizontal: 13 },
  listCard: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    ...shadows.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.line },
  rowCopy: { flex: 1 },
  name: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  meta: { color: palette.muted, fontSize: 11, marginTop: 4 },
  checkButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
    backgroundColor: palette.emeraldSoft,
  },
  checkButtonPresent: { backgroundColor: palette.emeraldDark },
  checkText: { color: palette.emeraldDark, fontSize: 11, fontWeight: '800' },
  checkTextPresent: { color: palette.white },
  pressed: { opacity: 0.75 },
});
