import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MemberCard } from '@/components/member-card';
import { EmptyState, LoadingView, PrimaryButton, Screen, Section, StatCard, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getBackupStatus, getDashboardStats, getGymProfile, getPlans } from '@/lib/database';
import { getBackupAgeReminder } from '@/lib/backup-safety';
import { formatCurrency, formatDate, todayIso } from '@/lib/format';
import { palette, radii } from '@/lib/theme';
import type { DashboardStats, GymProfile, MemberFilter } from '@/lib/types';

function openMembers(filter: MemberFilter = 'all') {
  router.push({ pathname: '/members', params: { filter, entry: String(Date.now()) } });
}

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const { revision } = useAppData();
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [backupAt, setBackupAt] = useState('');
  const [planCount, setPlanCount] = useState(0);
  const [profile, setProfile] = useState<GymProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const current = ++request.current;
    if (refresh) setRefreshing(true);
    try {
      const [nextStats, nextProfile, plans, backupStatus] = await Promise.all([
        getDashboardStats(db), getGymProfile(db), getPlans(db), getBackupStatus(db),
      ]);
      if (request.current !== current) return;
      setStats(nextStats);
      setProfile(nextProfile);
      setPlanCount(plans.length);
      setBackupAt(backupStatus.exportedAt);
      setLoadError('');
    } catch (error) {
      if (request.current === current) setLoadError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (request.current === current) setRefreshing(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => {
    void revision;
    void load();
    return () => { request.current += 1; };
  }, [load, revision]));

  if (loadError && !stats) return <Screen><EmptyState icon="alert-circle-outline" title="Could not load your gym" message={loadError} action={<PrimaryButton label="Try again" onPress={() => { void load(); }} />} /></Screen>;
  if (!stats) return <Screen><LoadingView /></Screen>;

  const backupReminder = getBackupAgeReminder(backupAt);
  const maxAttendance = Math.max(1, ...stats.weeklyAttendance.map((item) => item.count));

  return (
    <Screen scroll={false} contentContainerStyle={styles.screen}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} tintColor={palette.emeraldDark} />}>
        <TopBar eyebrow={formatDate(todayIso(), { weekday: 'long', day: 'numeric', month: 'long' })} title={profile?.gymName || 'Welcome to your gym'} subtitle="A clear view of your day" />

        {!!loadError && <View style={styles.errorCard}><Text selectable style={styles.errorText}>Could not refresh: {loadError}</Text><PrimaryButton label="Try again" variant="secondary" onPress={() => { void load(true); }} /></View>}

        {(!profile?.gymName.trim() || planCount === 0) && (
          <Section title="Make this your gym" subtitle="Set up once, manage every day">
            <Text style={styles.setupStep}>{profile?.gymName.trim() ? '✓ Gym details saved' : '1. Add your gym name and contact details'}</Text>
            <Text style={styles.setupStep}>{planCount > 0 ? '✓ Membership plans ready' : '2. Create your own plans and prices'}</Text>
            <PrimaryButton label="Set up my gym" icon="business-outline" onPress={() => router.push('/settings')} />
          </Section>
        )}

        <LinearGradient colors={[palette.ink, '#15352D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroCopy}><Text style={styles.heroLabel}>Collected this month</Text><Text selectable style={styles.heroAmount}>{formatCurrency(stats.collectedThisMonth)}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Open financial reports" style={styles.reportLink} onPress={() => router.push('/reports')}><Ionicons name="arrow-up-right-box-outline" size={22} color={palette.white} /></Pressable>
          </View>
          <View style={styles.heroBottom}>
            <View style={styles.heroMetric}><Text style={styles.heroMiniLabel}>Outstanding dues</Text><Text selectable style={styles.heroMiniValue}>{formatCurrency(stats.outstandingDue)}</Text></View>
            <View style={styles.heroMetric}><Text style={styles.heroMiniLabel}>Checked in today</Text><Text selectable style={styles.heroMiniValue}>{stats.presentToday}</Text></View>
          </View>
        </LinearGradient>

        <View style={styles.quickActions}>
          <QuickAction label="Add member" icon="person-add-outline" onPress={() => router.push('/member/new')} />
          <QuickAction label="Check in" icon="checkmark-circle-outline" onPress={() => router.push('/attendance')} />
          <QuickAction label="Collect dues" icon="wallet-outline" onPress={() => openMembers('due')} />
        </View>

        <View style={styles.statsGrid}>
          <StatCard icon="people" label="Active members" value={String(stats.activeMembers)} onPress={() => openMembers('active')} />
          <StatCard icon="time" label="Expiring in 7 days" value={String(stats.expiringSoon)} tone="amber" onPress={() => openMembers('expiring')} />
          <StatCard icon="person-add" label="All members" value={String(stats.totalMembers)} tone="blue" onPress={() => openMembers()} />
          <StatCard icon="alert-circle" label="Pending dues" value={formatCurrency(stats.outstandingDue)} tone="red" onPress={() => openMembers('due')} />
        </View>

        {stats.totalMembers > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Open backup and restore" onPress={() => router.push('/backup' as never)} style={({ pressed }) => [styles.backupStrip, backupReminder.overdue && styles.backupDue, pressed && styles.pressed]}>
            <Ionicons name={backupReminder.overdue ? 'shield-outline' : 'shield-checkmark-outline'} size={24} color={palette.emeraldDark} />
            <View style={styles.backupCopy}><Text style={styles.backupTitle}>{backupReminder.overdue ? 'Time for a backup' : 'Backup saved to folder'}</Text><Text style={styles.backupText}>{backupReminder.ageDays === null ? 'Save a copy of your records somewhere safe.' : `${formatDate(backupAt)} · Keep a copy off this phone`}</Text></View>
            <Ionicons name="chevron-forward" size={19} color={palette.emeraldDark} />
          </Pressable>
        )}

        <Section title="Renewals coming up" subtitle="Memberships ending within seven days" action={<Pressable accessibilityRole="button" accessibilityLabel="View all expiring memberships" style={styles.sectionAction} onPress={() => openMembers('expiring')}><Text style={styles.textAction}>View all</Text></Pressable>}>
          {stats.expiringMembers.length > 0 ? stats.expiringMembers.map((member) => <MemberCard key={member.id} member={member} compact />) : <Text style={styles.sectionEmpty}>No memberships are due to expire in the next seven days.</Text>}
        </Section>

        <Section title="This week’s attendance" subtitle="Daily check-ins over the last seven days">
          <View style={styles.chart}>
            {stats.weeklyAttendance.map((item, index) => (
              <View key={`${item.label}-${index}`} style={styles.chartColumn} accessibilityLabel={`${item.label}: ${item.count} check-ins`}>
                <Text style={styles.chartValue}>{item.count}</Text><View style={styles.chartTrack}><LinearGradient colors={[palette.emerald, palette.emeraldDark]} style={[styles.chartBar, { height: item.count === 0 ? 0 : Math.max(5, (item.count / maxAttendance) * 70) }]} /></View><Text style={styles.chartLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Recently joined" subtitle="The newest people in your gym" action={stats.recentMembers.length > 0 ? <Pressable accessibilityRole="button" style={styles.sectionAction} onPress={() => openMembers()}><Text style={styles.textAction}>View all</Text></Pressable> : undefined}>
          {stats.recentMembers.length === 0 ? <EmptyState icon="people-outline" title="Welcome your first member" message="Add a profile to start managing their membership, payments and attendance." action={<PrimaryButton label="Add first member" icon="person-add" onPress={() => router.push('/member/new')} />} /> : stats.recentMembers.map((member) => <MemberCard key={member.id} member={member} compact />)}
        </Section>
      </ScrollView>
    </Screen>
  );
}

function QuickAction({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><Ionicons name={icon} size={23} color={palette.emeraldDark} /><Text style={styles.quickLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  content: { paddingBottom: 28 },
  setupStep: { color: palette.inkSoft, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  hero: { borderRadius: radii.lg, padding: 18, marginBottom: 12 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  heroCopy: { flex: 1 },
  heroLabel: { color: '#BECBC8', fontSize: 13, fontWeight: '600' },
  heroAmount: { color: palette.white, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 5 },
  heroBottom: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)', marginTop: 14, paddingTop: 13 },
  heroMetric: { flex: 1, minWidth: 120 },
  heroMiniLabel: { color: '#BECBC8', fontSize: 12 },
  heroMiniValue: { color: palette.white, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 4 },
  reportLink: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: 'rgba(255,255,255,0.09)' },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickAction: { flex: 1, minHeight: 80, borderRadius: radii.md, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 12, gap: 7 },
  quickLabel: { color: palette.inkSoft, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 },
  backupStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radii.md, backgroundColor: palette.emeraldSoft, marginBottom: 16 },
  backupDue: { backgroundColor: palette.amberSoft },
  backupCopy: { flex: 1 },
  backupTitle: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  backupText: { color: palette.inkSoft, fontSize: 12, lineHeight: 18, marginTop: 3 },
  sectionAction: { minHeight: 48, minWidth: 48, justifyContent: 'center' },
  sectionEmpty: { color: palette.muted, fontSize: 14, lineHeight: 21, paddingVertical: 8 },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  chartColumn: { flex: 1, alignItems: 'center' },
  chartValue: { color: palette.inkSoft, fontSize: 12, fontWeight: '700', marginBottom: 5 },
  chartTrack: { height: 72, width: 18, borderRadius: 7, backgroundColor: palette.canvas, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: 18, borderRadius: 7 },
  chartLabel: { color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 7 },
  textAction: { color: palette.emeraldDark, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  errorCard: { padding: 14, gap: 12, borderRadius: radii.md, backgroundColor: palette.redSoft, marginBottom: 12 },
  errorText: { color: palette.ink, fontSize: 14, lineHeight: 20 },
});
