import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { currentMonthKey, formatMonthLabel, isFutureMonthKey, shiftMonth } from '@/lib/history-period';
import { palette, radii } from '@/lib/theme';

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  allowAllTime?: boolean;
};

export function MonthFilter({ value, onChange, allowAllTime = false }: Props) {
  const currentMonth = currentMonthKey();
  const selectedMonth = value ?? currentMonth;
  const isFutureMonth = value !== null && isFutureMonthKey(value);

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
        <View style={styles.labelWrap}>
          <Text style={styles.label}>{value ? formatMonthLabel(value) : 'All time'}</Text>
          {isFutureMonth && <Text style={styles.futureLabel}>Upcoming</Text>}
        </View>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          onPress={() => onChange(shiftMonth(selectedMonth, 1))}
          style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
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
  labelWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  label: { color: palette.ink, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  futureLabel: { color: palette.blue, fontSize: 9, fontWeight: '900', letterSpacing: 0.7, marginTop: 1, textTransform: 'uppercase' },
  action: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: radii.md },
  actionText: { color: palette.emeraldDark, fontSize: 13, fontWeight: '800' },
  allTime: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: palette.card },
  allTimeSelected: { backgroundColor: palette.emeraldDark },
  allTimeText: { color: palette.inkSoft, fontSize: 12, fontWeight: '800' },
  allTimeTextSelected: { color: palette.white },
  pressed: { opacity: 0.7 },
});
