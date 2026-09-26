import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui-kit';
import { formatDate, todayIso } from '@/lib/format';
import { memberBalanceLabel } from '@/lib/member-presentation';
import { palette, radii } from '@/lib/theme';
import type { MemberListItem } from '@/lib/types';

export function MemberCard({
  member,
  compact = false,
}: {
  member: MemberListItem;
  compact?: boolean;
}) {
  const historical = member.snapshot_date < todayIso();
  const cancelled = member.snapshot_status === 'cancelled';
  const expired = member.snapshot_status === 'expired';
  const daysRemaining = member.end_date
    ? Math.round((
      new Date(`${member.end_date}T00:00:00Z`).getTime()
      - new Date(`${member.snapshot_date}T00:00:00Z`).getTime()
    ) / 86_400_000)
    : null;
  const warning = member.snapshot_status === 'active'
    && daysRemaining !== null
    && daysRemaining >= 0
    && daysRemaining <= 7;
  const planLine = `${historical ? `As of ${formatDate(member.snapshot_date)} · ` : ''}${member.plan_name ?? 'No plan'}`;
  const statusCopy = cancelled
    ? 'Membership cancelled'
    : expired
      ? `Expired ${formatDate(member.end_date, { day: '2-digit', month: 'short' })}`
      : member.snapshot_status === 'active'
        ? `Ends ${formatDate(member.end_date, { day: '2-digit', month: 'short' })}`
        : member.snapshot_status === 'upcoming' ? 'Starts later'
          : member.snapshot_status === 'frozen' ? 'Frozen'
            : 'No membership';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${member.name}, ${statusCopy}, ${memberBalanceLabel(member.due_amount, member.snapshot_status)}`}
      onPress={() => router.push(`/member/${member.id}`)}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}>
      <Avatar name={member.name} uri={member.photo_uri} size={compact ? 46 : 58} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{member.name}</Text>
          {member.attended_today === 1 && (
            <View style={styles.presentPill}>
              <View style={styles.presentDot} />
              <Text style={styles.presentText}>Present</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          {member.membership_id}  ·  {planLine}
        </Text>
        <View style={[styles.footer, compact && styles.compactFooter]}>
          <View style={styles.footerItem}>
            <Ionicons name={warning ? 'time-outline' : 'calendar-outline'} size={15} color={warning ? '#956208' : palette.muted} />
            <Text style={[styles.footerText, (expired || warning) && styles.warningText]}>
              {member.status === 'blocked' ? `Blocked · ${statusCopy}` : statusCopy}
            </Text>
          </View>
          <Text style={[
            styles.due,
            member.due_amount === 0 && styles.paid,
            member.due_amount === 0 && (cancelled || member.snapshot_status === 'none') && styles.cancelled,
          ]}>
            {memberBalanceLabel(member.due_amount, member.snapshot_status)}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={19} color={palette.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    gap: 11,
  },
  compact: { paddingVertical: 11 },
  pressed: { opacity: 0.68 },
  copy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  name: { flexShrink: 1, color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  meta: { color: palette.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  compactFooter: { marginTop: 6 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  footerText: { flexShrink: 1, color: palette.inkSoft, fontSize: 13, fontWeight: '600' },
  warningText: { color: '#956208', fontWeight: '800' },
  due: { color: palette.red, fontSize: 13, fontWeight: '800' },
  paid: { color: palette.emeraldDark },
  cancelled: { color: palette.muted },
  presentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: palette.emeraldSoft,
  },
  presentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.emerald },
  presentText: { color: palette.emeraldDark, fontSize: 10, fontWeight: '800' },
});
