import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { MemberCard } from '@/components/member-card';
import { Chip, EmptyState, LoadingView, Screen, SearchBox, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getMembers } from '@/lib/database';
import { palette, radii, shadows } from '@/lib/theme';
import type { MemberFilter, MemberListItem } from '@/lib/types';

const FILTERS = [
  { key: 'all', label: 'All', icon: 'people-outline' },
  { key: 'due', label: 'Pending dues', icon: 'alert-circle-outline' },
  { key: 'paid', label: 'Paid', icon: 'checkmark-circle-outline' },
] as const;

const FILTER_COPY: Record<MemberFilter, { found: string; emptyTitle: string; emptyMessage: string }> = {
  all: {
    found: 'profiles found',
    emptyTitle: 'No members yet',
    emptyMessage: 'Create the first profile and assign a membership plan.',
  },
  active: {
    found: 'active members',
    emptyTitle: 'No active members',
    emptyMessage: 'Members with a current membership will appear here.',
  },
  due: {
    found: 'members with pending dues',
    emptyTitle: 'No pending dues',
    emptyMessage: 'Everyone is fully paid or cancelled right now.',
  },
  paid: {
    found: 'fully paid members',
    emptyTitle: 'No fully paid members',
    emptyMessage: 'Members will appear here once their active plan balance is zero.',
  },
  expired: {
    found: 'expired members',
    emptyTitle: 'No expired members',
    emptyMessage: 'Members with an ended membership will appear here.',
  },
  cancelled: {
    found: 'cancelled memberships',
    emptyTitle: 'No cancelled memberships',
    emptyMessage: 'Cancelled memberships will appear here.',
  },
};

function normalizeFilter(value: unknown): MemberFilter {
  const next = Array.isArray(value) ? value[0] : value;
  return next === 'due' || next === 'paid' ? next : 'all';
}

export default function MembersScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { revision } = useAppData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MemberFilter>(normalizeFilter(params.filter));
  const [members, setMembers] = useState<MemberListItem[] | null>(null);

  const load = useCallback(async () => {
    setMembers(await getMembers(db, search, filter));
  }, [db, filter, search]);

  useEffect(() => {
    setFilter(normalizeFilter(params.filter));
  }, [params.filter]);

  useFocusEffect(useCallback(() => {
    void revision;
    load();
  }, [load, revision]));

  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [load]);

  const copy = FILTER_COPY[filter];

  return (
    <Screen scroll={false}>
      <TopBar
        eyebrow="Member directory"
        title="Members"
        subtitle={members ? `${members.length} ${copy.found}` : 'Loading profiles'}
      />
      <SearchBox value={search} onChangeText={setSearch} placeholder="Name, phone or member ID" />
      <View style={styles.filterRow}>
        {FILTERS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            icon={item.icon}
            selected={filter === item.key}
            onPress={() => setFilter(item.key)}
          />
        ))}
      </View>
      <View style={styles.listArea}>
        {members === null ? (
          <LoadingView />
        ) : members.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={search ? 'search-outline' : filter === 'due' ? 'wallet-outline' : 'people-outline'}
              title={search ? 'No matching members' : copy.emptyTitle}
              message={
                search
                  ? 'Try a different name, phone number, or member ID.'
                  : copy.emptyMessage
              }
            />
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(member) => String(member.id)}
            renderItem={({ item }) => <MemberCard member={item} />}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.memberList}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
      <Pressable
        onPress={() => router.push('/member/new')}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
        <Ionicons name="person-add" size={22} color={palette.white} />
        <Text style={styles.fabText}>Add member</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  listArea: { flex: 1, marginHorizontal: -18 },
  memberList: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingBottom: 110 },
  emptyWrap: { flex: 1, paddingHorizontal: 18, justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 94,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 19,
    borderRadius: radii.md,
    backgroundColor: palette.emeraldDark,
    ...shadows.card,
  },
  fabText: { color: palette.white, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
