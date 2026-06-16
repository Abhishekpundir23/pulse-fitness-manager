import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { MemberCard } from '@/components/member-card';
import { EmptyState, LoadingView, Screen, SearchBox, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getMembers } from '@/lib/database';
import { palette, radii, shadows } from '@/lib/theme';
import type { MemberListItem } from '@/lib/types';

export default function MembersScreen() {
  const db = useSQLiteContext();
  const { revision } = useAppData();
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<MemberListItem[] | null>(null);

  const load = useCallback(async () => {
    setMembers(await getMembers(db, search));
  }, [db, search]);

  useFocusEffect(useCallback(() => {
    void revision;
    load();
  }, [load, revision]));

  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <Screen scroll={false}>
      <TopBar
        eyebrow="Member directory"
        title="Members"
        subtitle={members ? `${members.length} profiles found` : 'Loading profiles'}
      />
      <SearchBox value={search} onChangeText={setSearch} placeholder="Name, phone or member ID" />
      <View style={styles.listCard}>
        {members === null ? (
          <LoadingView />
        ) : members.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title={search ? 'No matching members' : 'No members yet'}
            message={
              search
                ? 'Try a different name, phone number, or member ID.'
                : 'Create the first profile and assign a membership plan.'
            }
          />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(member) => String(member.id)}
            renderItem={({ item }) => <MemberCard member={item} />}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
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
  listCard: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    overflow: 'hidden',
    ...shadows.card,
  },
  listContent: { paddingBottom: 86 },
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
