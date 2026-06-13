import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDate, initials, toIsoDate } from '@/lib/format';
import { palette, radii, shadows } from '@/lib/theme';

export function Screen({
  children,
  scroll = true,
  contentContainerStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const content = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.screenContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, styles.flex, contentContainerStyle]}>{children}</View>
  );
  return <SafeAreaView style={styles.safeArea}>{content}</SafeAreaView>;
}

export function TopBar({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarCopy}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.topBarTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.topBarSubtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

export function IconButton({
  name,
  onPress,
  color = palette.ink,
  backgroundColor = palette.card,
  size = 22,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  backgroundColor?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor, opacity: pressed ? 0.72 : 1 },
      ]}>
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Section({
  title,
  subtitle,
  action,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      {(title || action) && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleWrap}>
            {!!title && <Text style={styles.sectionTitle}>{title}</Text>}
            {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function StatCard({
  icon,
  label,
  value,
  tone = 'green',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: 'green' | 'amber' | 'blue' | 'red';
}) {
  const toneMap = {
    green: [palette.emeraldSoft, palette.emeraldDark],
    amber: [palette.amberSoft, '#A45F08'],
    blue: [palette.blueSoft, palette.blue],
    red: [palette.redSoft, palette.red],
  } as const;
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: toneMap[tone][0] }]}>
        <Ionicons name={icon} size={21} color={toneMap[tone][1]} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Avatar({
  name,
  uri,
  size = 54,
}: {
  name: string;
  uri?: string | null;
  size?: number;
}) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}>
      <Text style={[styles.avatarText, { fontSize: Math.max(14, size * 0.34) }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function FormField({
  label,
  icon,
  containerStyle,
  ...props
}: TextInputProps & {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.fieldWrap, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.field}>
        {!!icon && <Ionicons name={icon} size={20} color={palette.muted} />}
        <TextInput
          placeholderTextColor={palette.muted}
          style={[styles.input, props.multiline && styles.multiline]}
          {...props}
        />
      </View>
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
  maximumDate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maximumDate?: Date;
}) {
  const [show, setShow] = useState(false);
  const date = new Date(`${value}T00:00:00`);
  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setShow(false);
    if (event.type !== 'dismissed' && selected) onChange(toIsoDate(selected));
  };

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setShow(true)}>
        <Ionicons name="calendar-outline" size={20} color={palette.muted} />
        <Text style={styles.dateText}>{formatDate(value)}</Text>
      </Pressable>
      {show && (
        <DateTimePicker
          mode="date"
          value={Number.isNaN(date.getTime()) ? new Date() : date}
          maximumDate={maximumDate}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}>
      {!!icon && (
        <Ionicons
          name={icon}
          size={17}
          color={selected ? palette.white : palette.inkSoft}
        />
      )}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
        (disabled || loading) && styles.disabledButton,
        pressed && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? palette.emeraldDark : palette.white} />
      ) : (
        <>
          {!!icon && (
            <Ionicons
              name={icon}
              size={20}
              color={variant === 'secondary' ? palette.emeraldDark : palette.white}
            />
          )}
          <Text
            style={[
              styles.primaryButtonText,
              variant === 'secondary' && styles.secondaryButtonText,
            ]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={palette.emeraldDark} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action}
    </View>
  );
}

export function SearchBox({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={20} color={palette.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={styles.searchInput}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={20} color={palette.muted} />
        </Pressable>
      )}
    </View>
  );
}

export function LoadingView() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={palette.emerald} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  flex: { flex: 1 },
  screenContent: { paddingHorizontal: 18, paddingBottom: 120, backgroundColor: palette.canvas },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 22,
    gap: 16,
  },
  topBarCopy: { flex: 1 },
  eyebrow: {
    color: palette.emeraldDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  topBarTitle: { color: palette.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  topBarSubtitle: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  section: {
    backgroundColor: palette.card,
    borderRadius: radii.lg,
    padding: 18,
    marginBottom: 16,
    ...shadows.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitleWrap: { flex: 1 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { color: palette.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  statCard: {
    width: '48%',
    minHeight: 142,
    padding: 16,
    backgroundColor: palette.card,
    borderRadius: radii.lg,
    ...shadows.card,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statValue: { color: palette.ink, fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { color: palette.muted, fontSize: 12, fontWeight: '600', marginTop: 5 },
  avatarFallback: {
    backgroundColor: palette.emeraldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: palette.emeraldDark, fontWeight: '900' },
  fieldWrap: { marginBottom: 15 },
  fieldLabel: { color: palette.inkSoft, fontWeight: '700', fontSize: 13, marginBottom: 7 },
  field: {
    minHeight: 54,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: '#FAFBFC',
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, color: palette.ink, fontSize: 16, paddingVertical: 13 },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
  dateText: { color: palette.ink, fontSize: 16 },
  chip: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipSelected: { borderColor: palette.emeraldDark, backgroundColor: palette.emeraldDark },
  chipText: { color: palette.inkSoft, fontSize: 14, fontWeight: '700' },
  chipTextSelected: { color: palette.white },
  primaryButton: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: palette.emeraldDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
  },
  secondaryButton: {
    backgroundColor: palette.emeraldSoft,
    borderWidth: 1,
    borderColor: '#B7EAD5',
  },
  dangerButton: { backgroundColor: palette.red },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: palette.white, fontSize: 16, fontWeight: '800' },
  secondaryButtonText: { color: palette.emeraldDark },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  emptyState: { paddingVertical: 24, alignItems: 'center', paddingHorizontal: 18 },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.emeraldSoft,
    marginBottom: 14,
  },
  emptyTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  emptyMessage: {
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 16,
  },
  searchBox: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    backgroundColor: palette.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.line,
    marginBottom: 16,
  },
  searchInput: { flex: 1, color: palette.ink, fontSize: 16 },
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
});

