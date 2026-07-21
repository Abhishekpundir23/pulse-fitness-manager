import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { currentMonthKey, formatMonthLabel, shiftMonth } from '@/lib/history-period';
import { palette, radii } from '@/lib/theme';

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  allowAllTime?: boolean;
};

export function MonthFilter({ value, onChange, allowAllTime = false }: Props) {
  const currentMonth = currentMonthKey();
  const selectedMonth = value ?? currentMonth;
  const isCurrentMonth = selectedMonth === currentMonth;

  return (
    <View style={styles.wrap}>
      <View style={styles.control}>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          onPress={() => onChange(shiftMonth(selectedMonth, -1))}
          style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={19} color={palette.ink} />
        </Pressable>
        <Text style={styles.label}>{value ? formatMonthLabel(value) : 'All time'}</Text>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          disabled={isCurrentMonth}
          onPress={() => onChange(shiftMonth(selectedMonth, 1))}
          style={({ pressed }) => [styles.arrow, isCurrentMonth && styles.disabled, pressed && styles.pressed]}>
          <Ionicons name="chevron-forward" size={19} color={palette.ink} />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(currentMonth)}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Text style={styles.actionText}>Current</Text>
      </Pressable>
      {allowAllTime && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(null)}
          style={({ pressed }) => [styles.allTime, value === null && styles.allTimeSelected, pressed && styles.pressed]}>
          <Text style={[styles.allTimeText, value === null && styles.allTimeTextSelected]}>All time</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: palette.card,
  },
  arrow: { width: 42, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: palette.ink, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  action: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: radii.md },
  actionText: { color: palette.emeraldDark, fontSize: 13, fontWeight: '800' },
  allTime: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: palette.card },
  allTimeSelected: { backgroundColor: palette.emeraldDark },
  allTimeText: { color: palette.inkSoft, fontSize: 12, fontWeight: '800' },
  allTimeTextSelected: { color: palette.white },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
});
