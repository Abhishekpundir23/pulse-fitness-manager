import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SettingsRow } from '@/components/settings-row';
import { EmptyState, LoadingView, PrimaryButton, Screen, Section, TopBar } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getBackupAgeReminder } from '@/lib/backup-safety';
import { getAllPlans, getBackupStatus, getGymProfile, type BackupStatus } from '@/lib/database';
import { palette, radii } from '@/lib/theme';
import type { GymProfile } from '@/lib/types';

type HubData = { profile: GymProfile; activePlans: number; backup: BackupStatus };
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { revision } = useAppData();
  const [data, setData] = useState<HubData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const [profile, plans, backup] = await Promise.all([getGymProfile(db), getAllPlans(db), getBackupStatus(db)]);
      if (id === request.current) { setData({ profile, activePlans: plans.filter((p) => p.active).length, backup }); setError(''); }
    } catch (cause) { if (id === request.current) setError(cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { if (id === request.current) setRefreshing(false); }
  }, [db]);
  useFocusEffect(useCallback(() => { void revision; void load(); return () => { request.current++; }; }, [load, revision]));
  if (!data) return <Screen>{error ? <EmptyState icon="alert-circle-outline" title="Could not load your gym" message={error} action={<PrimaryButton label="Try again" onPress={load} />} /> : <LoadingView />}</Screen>;
  const reminder = getBackupAgeReminder(data.backup.exportedAt);
  return <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }}>
    <TopBar eyebrow="Pulse Fitness Manager" title="Your gym" subtitle="Make it yours. Keep it organised." />
    {!!error && <Section title="Could not refresh"><Text selectable style={styles.body}>{error}</Text><PrimaryButton label="Try again" variant="secondary" onPress={load} /></Section>}
    <Pressable accessibilityRole="button" accessibilityLabel="Edit gym details" onPress={() => router.push('/gym-profile')} style={({ pressed }) => [styles.identity, pressed && { opacity: 0.8 }]}>
      <View style={styles.gymIcon}><Ionicons name="business-outline" size={26} color={palette.emeraldDark} /></View>
      <View style={styles.identityCopy}><Text style={styles.gymName}>{data.profile.gymName || 'Set up your gym'}</Text><Text style={styles.identityMeta}>{data.profile.ownerName || 'Add your name and contact details'}</Text><Text style={styles.edit}>Edit gym details</Text></View>
      <Ionicons name="chevron-forward" size={20} color={palette.emeraldDark} />
    </Pressable>
    <Section title="Manage your gym" style={styles.menu}>
      <SettingsRow icon="shield-checkmark-outline" title="Backup & restore" subtitle={reminder.overdue ? reminder.message : 'Your latest folder backup is up to date'} tone={reminder.overdue ? 'amber' : 'green'} onPress={() => router.push('/backup')} />
      <SettingsRow icon="barbell-outline" title="Membership plans" subtitle={data.activePlans ? `${data.activePlans} active ${data.activePlans === 1 ? 'plan' : 'plans'} · Your names, durations and prices` : 'Create your first plan with any name and price'} onPress={() => router.push('/plans')} />
      <SettingsRow icon="people-outline" title="Import member list" subtitle={data.activePlans ? 'Preview a CSV spreadsheet before importing' : 'Create a membership plan first'} tone="blue" onPress={() => router.push(data.activePlans ? '/import-members' : '/plans')} />
      <SettingsRow icon="receipt-outline" title="Payment history" subtitle="Receipts, payment methods and corrections" onPress={() => router.push('/payments')} />
    </Section>
    <Section title="Help & privacy" style={styles.menu}>
      <SettingsRow icon="help-circle-outline" title="Help & support" subtitle="Getting started, changing phones and contacting us" onPress={() => router.push('/help')} />
      <SettingsRow icon="lock-closed-outline" title="Privacy & your data" subtitle="What stays on your phone and what you choose to share" onPress={() => router.push('/privacy')} />
    </Section>
    <View style={styles.footer}><Ionicons name="phone-portrait-outline" size={16} color={palette.emeraldDark} /><Text style={styles.footerText}>Saved on this phone · No account needed</Text></View>
    <Text style={styles.version}>Pulse Fitness Manager {Constants.expoConfig?.version ?? '1.4.0'}</Text>
  </Screen>;
}
const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radii.lg, backgroundColor: palette.emeraldSoft, marginBottom: 20 },
  gymIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1 }, gymName: { color: palette.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  identityMeta: { color: palette.inkSoft, fontSize: 13, lineHeight: 20, marginTop: 4 }, edit: { color: palette.emeraldDark, fontSize: 13, fontWeight: '700', marginTop: 10 },
  menu: { paddingBottom: 4 }, body: { color: palette.red, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  footer: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  footerText: { color: palette.inkSoft, fontSize: 12, flexShrink: 1 }, version: { color: palette.muted, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
