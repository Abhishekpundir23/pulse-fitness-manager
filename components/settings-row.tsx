import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, radii } from '@/lib/theme';

export function SettingsRow({ icon, title, subtitle, onPress, tone = 'green' }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  tone?: 'green' | 'amber' | 'blue';
}) {
  const colors = { green: [palette.emeraldSoft, palette.emeraldDark], amber: [palette.amberSoft, '#935A0A'], blue: [palette.blueSoft, palette.blue] };
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
    <View style={[styles.icon, { backgroundColor: colors[tone][0] }]}><Ionicons name={icon} size={22} color={colors[tone][1]} /></View>
    <View style={styles.copy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
    <Ionicons name="chevron-forward" size={18} color={palette.muted} />
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '700', color: palette.ink },
  subtitle: { fontSize: 13, lineHeight: 19, color: palette.muted, marginTop: 4 },
});
