import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MemberCard } from '@/components/member-card';
import {
  EmptyState,
  IconButton,
  LoadingView,
  PrimaryButton,
  Screen,
  Section,
  StatCard,
  TopBar,
} from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getDashboardStats, getGymProfile } from '@/lib/database';
import { formatCurrency } from '@/lib/format';
import { palette, radii, shadows } from '@/lib/theme';
import type { DashboardStats, GymProfile } from '@/lib/types';

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const { revision } = useAppData();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [profile, setProfile] = useState<GymProfile | null>(null);

  const load = useCallback(async () => {
    const [nextStats, nextProfile] = await Promise.all([
      getDashboardStats(db),
      getGymProfile(db),
    ]);
    setStats(nextStats);
    setProfile(nextProfile);
  }, [db]);

  useFocusEffect(useCallback(() => {
    void revision;
    load();
  }, [load, revision]));

  if (!stats) return <Screen><LoadingView /></Screen>;

  const maxAttendance = Math.max(1, ...stats.weeklyAttendance.map((item) => item.count));

  return (
    <Screen>
      <TopBar
        eyebrow="Gym command centre"
        title={profile?.gymName || 'Pulse Fitness'}
        subtitle="Your business, today at a glance"
        action={
          <IconButton
            name="add"
            color={palette.white}
            backgroundColor={palette.emeraldDark}
            onPress={() => router.push('/member/new')}
          />
        }
      />

      <LinearGradient
        colors={[palette.ink, '#15352D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>Collected this month</Text>
            <Text style={styles.heroAmount}>{formatCurrency(stats.collectedThisMonth)}</Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="trending-up" size={23} color={palette.lime} />
          </View>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroBottom}>
          <View>
            <Text style={styles.heroMiniLabel}>Outstanding</Text>
            <Text style={styles.heroMiniValue}>{formatCurrency(stats.outstandingDue)}</Text>
          </View>
          <View>
            <Text style={styles.heroMiniLabel}>Present today</Text>
            <Text style={styles.heroMiniValue}>{stats.presentToday}</Text>
          </View>
          <Pressable style={styles.reportLink} onPress={() => router.push('/reports')}>
            <Text style={styles.reportLinkText}>Reports</Text>
            <Ionicons name="arrow-forward" size={15} color={palette.white} />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.statsGrid}>
        <StatCard icon="people" label="Active members" value={String(stats.activeMembers)} />
        <StatCard icon="time" label="Expiring in 7 days" value={String(stats.expiringSoon)} tone="amber" />
        <StatCard icon="person-add" label="All members" value={String(stats.totalMembers)} tone="blue" />
        <StatCard icon="alert-circle" label="Pending dues" value={formatCurrency(stats.outstandingDue)} tone="red" />
      </View>

      <Section title="Attendance pulse" subtitle="Check-ins during the last seven days">
        <View style={styles.chart}>
          {stats.weeklyAttendance.map((item, index) => (
            <View key={`${item.label}-${index}`} style={styles.chartColumn}>
              <Text style={styles.chartValue}>{item.count}</Text>
              <View style={styles.chartTrack}>
                <LinearGradient
                  colors={[palette.emerald, palette.emeraldDark]}
                  style={[
                    styles.chartBar,
                    { height: Math.max(7, (item.count / maxAttendance) * 76) },
                  ]}
                />
              </View>
              <Text style={styles.chartLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </Section>

      {stats.expiringMembers.length > 0 && (
        <Section
          title="Needs attention"
          subtitle="Memberships expiring in the next 7 days"
          action={
            <Pressable onPress={() => router.push('/members')}>
              <Text style={styles.textAction}>View all</Text>
            </Pressable>
          }>
          {stats.expiringMembers.map((member) => (
            <MemberCard key={member.id} member={member} compact />
          ))}
        </Section>
      )}

      <Section
        title="Newest members"
        subtitle="Recently added profiles"
        action={
          stats.recentMembers.length > 0 ? (
            <Pressable onPress={() => router.push('/members')}>
              <Text style={styles.textAction}>View all</Text>
            </Pressable>
          ) : undefined
        }>
        {stats.recentMembers.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Your member list is ready"
            message="Add the first member to begin tracking plans, payments, and attendance."
            action={
              <PrimaryButton
                label="Add first member"
                icon="person-add"
                onPress={() => router.push('/member/new')}
              />
            }
          />
        ) : (
          stats.recentMembers.map((member) => (
            <MemberCard key={member.id} member={member} compact />
          ))
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radii.xl,
    padding: 22,
    marginBottom: 18,
    ...shadows.card,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { color: '#A7B4BE', fontSize: 13, fontWeight: '700' },
  heroAmount: { color: palette.white, fontSize: 34, fontWeight: '900', marginTop: 6 },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(169,229,91,0.13)',
  },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.13)', marginVertical: 18 },
  heroBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  heroMiniLabel: { color: '#90A1AB', fontSize: 11 },
  heroMiniValue: { color: palette.white, fontSize: 16, fontWeight: '800', marginTop: 4 },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  reportLinkText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 },
  chart: { height: 130, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  chartColumn: { flex: 1, alignItems: 'center' },
  chartValue: { color: palette.inkSoft, fontSize: 10, fontWeight: '700', marginBottom: 5 },
  chartTrack: { height: 80, width: 16, borderRadius: 8, backgroundColor: palette.canvas, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: 16, borderRadius: 8 },
  chartLabel: { color: palette.muted, fontSize: 11, fontWeight: '700', marginTop: 7 },
  textAction: { color: palette.emeraldDark, fontSize: 13, fontWeight: '800' },
});
