import { useFocusEffect, useNavigation, usePreventRemove } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, Text } from 'react-native';
import { EmptyState, FormField, LoadingView, PrimaryButton, Screen, Section } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getGymProfile, saveGymProfile } from '@/lib/database';
import { palette } from '@/lib/theme';
import type { GymProfile } from '@/lib/types';

export default function GymProfileScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { refreshData } = useAppData();
  const [profile, setProfile] = useState<GymProfile | null>(null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const load = useCallback(async () => {
    try { const next = await getGymProfile(db); if (!dirtyRef.current) setProfile(next); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); }
  }, [db]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  usePreventRemove(dirty, ({ data }) => {
    if (savingRef.current) return;
    Alert.alert('Keep your changes?', 'Your gym details have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard changes', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const update = (key: keyof GymProfile, value: string) => {
    dirtyRef.current = true; setDirty(true); setProfile((old) => old ? { ...old, [key]: value } : old);
  };
  const save = async () => {
    if (!profile || savingRef.current) return;
    if (!profile.gymName.trim()) return Alert.alert('Gym name required', 'Enter your gym name before saving.');
    savingRef.current = true; setSaving(true);
    try {
      await saveGymProfile(db, profile);
      dirtyRef.current = false; setDirty(false); refreshData();
      Alert.alert('Gym details saved', 'Your details are ready for member invoices.');
    } catch (cause) { Alert.alert('Could not save', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  if (!profile) return <Screen>{error ? <EmptyState icon="alert-circle-outline" title="Could not load gym details" message={error} action={<PrimaryButton label="Try again" onPress={load} />} /> : <LoadingView />}</Screen>;
  return <Screen><Section title="Gym details" subtitle="Used on your dashboard and member invoices">
    {!!error && <Text selectable style={{ color: palette.red, marginBottom: 14 }}>{error}</Text>}
    <FormField editable={!saving} label="Gym name" value={profile.gymName} onChangeText={(v) => update('gymName', v)} icon="business-outline" autoCapitalize="words" />
    <FormField editable={!saving} label="Owner / manager" value={profile.ownerName} onChangeText={(v) => update('ownerName', v)} icon="person-outline" autoCapitalize="words" />
    <FormField editable={!saving} label="Phone" value={profile.phone} onChangeText={(v) => update('phone', v)} icon="call-outline" keyboardType="phone-pad" />
    <FormField editable={!saving} label="Email" value={profile.email} onChangeText={(v) => update('email', v)} icon="mail-outline" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
    <FormField editable={!saving} label="Address" value={profile.address} onChangeText={(v) => update('address', v)} icon="location-outline" multiline />
    <PrimaryButton label={dirty ? 'Save changes' : 'Save gym details'} icon="checkmark" onPress={save} loading={saving} />
  </Section></Screen>;
}
