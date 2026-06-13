import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui-kit';
import { daysUntil, formatCurrency, formatDate } from '@/lib/format';
import { palette, radii } from '@/lib/theme';
import type { MemberListItem } from '@/lib/types';

export function MemberCard({
  member,
  compact = false,
}: {
  member: MemberListItem;
  compact?: boolean;
}) {
  const days = daysUntil(member.end_date);
  const expired = days !== null && days < 0;
  const warning = days !== null && days >= 0 && days <= 7;
  const cancelled = member.membership_status === 'cancelled';

  return (
    <Pressable
      onPress={() => router.push(`/member/${member.id}`)}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}>
      <Avatar name={member.name} uri={member.photo_uri} size={compact ? 46 : 58} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>{member.name}</Text>
          {member.attended_today === 1 && (
            <View style={styles.presentPill}>
              <View style={styles.presentDot} />
              <Text style={styles.presentText}>Present</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          {member.membership_id}  ·  {member.plan_name ?? 'No plan'}
        </Text>
        {!compact && (
          <View style={styles.footer}>
            <View style={styles.footerItem}>
              <Ionicons name="calendar-outline" size={15} color={palette.muted} />
              <Text style={[styles.footerText, (expired || warning) && styles.warningText]}>
                {cancelled
                  ? 'Membership cancelled'
                  : `${expired ? 'Expired ' : 'Ends '}${formatDate(member.end_date, {
                    day: '2-digit',
                    month: 'short',
                  })}`}
              </Text>
            </View>
            <Text style={[
              styles.due,
              member.due_amount === 0 && styles.paid,
              cancelled && styles.cancelled,
            ]}>
              {cancelled
                ? 'No due'
                : member.due_amount > 0
                  ? `${formatCurrency(member.due_amount)} due`
                  : 'Paid'}
            </Text>
          </View>
        )}
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
    gap: 13,
  },
  compact: { paddingVertical: 11 },
  pressed: { opacity: 0.68 },
  copy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, color: palette.ink, fontSize: 16, fontWeight: '800' },
  meta: { color: palette.muted, fontSize: 12, marginTop: 4 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { color: palette.inkSoft, fontSize: 12, fontWeight: '600' },
  warningText: { color: palette.amber, fontWeight: '800' },
  due: { color: palette.red, fontSize: 12, fontWeight: '800' },
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
