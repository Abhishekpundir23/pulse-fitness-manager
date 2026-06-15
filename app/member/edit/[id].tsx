import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Chip, FormField, LoadingView, PrimaryButton, Screen, Section } from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { getMemberDetail, updateMemberProfile } from '@/lib/database';
import { persistMemberPhoto } from '@/lib/member-photo';
import { palette, radii } from '@/lib/theme';
import type { Gender } from '@/lib/types';

export default function EditMemberScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const memberId = Number(params.id);
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('Male');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState('');

  useEffect(() => {
    getMemberDetail(db, memberId).then((member) => {
      if (!member) {
        Alert.alert('Member not found', 'This profile is no longer available.', [
          { text: 'Go back', onPress: () => router.back() },
        ]);
        return;
      }
      setName(member.name);
      setGender(member.gender);
      setPhone(member.phone);
      setEmail(member.email ?? '');
      setDateOfBirth(member.date_of_birth ?? '');
      setAddress(member.address ?? '');
      setNotes(member.notes ?? '');
      setPhotoUri(member.photo_uri ?? '');
      setLoading(false);
    });
  }, [db, memberId]);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to take a new profile photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const choosePhotoSource = () => {
    Alert.alert('Update profile photo', 'Choose a photo source.', [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose from gallery', onPress: pickPhoto },
      ...(photoUri
        ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => setPhotoUri('') }]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const save = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter the member’s full name.');
      return;
    }
    if (cleanPhone.length < 10) {
      Alert.alert('Valid phone required', 'Enter a valid 10-digit mobile number.');
      return;
    }
    setSaving(true);
    try {
      await updateMemberProfile(db, memberId, {
        name,
        gender,
        phone: cleanPhone,
        email,
        dateOfBirth,
        address,
        notes,
        photoUri: persistMemberPhoto(photoUri),
      });
      refreshData();
      router.back();
    } catch (error) {
      Alert.alert('Could not update member', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Screen><LoadingView /></Screen>;

  return (
    <Screen>
      <View style={styles.photoArea}>
        <Avatar name={name} uri={photoUri} size={108} />
        <Pressable style={styles.cameraButton} onPress={choosePhotoSource}>
          <Ionicons name="camera" size={21} color={palette.white} />
        </Pressable>
        <View style={styles.photoActions}>
          <Pressable onPress={takePhoto} style={styles.photoAction}>
            <Ionicons name="camera-outline" size={17} color={palette.emeraldDark} />
            <Text style={styles.photoActionText}>Take new photo</Text>
          </Pressable>
          <Pressable onPress={pickPhoto} style={styles.photoAction}>
            <Ionicons name="images-outline" size={17} color={palette.emeraldDark} />
            <Text style={styles.photoActionText}>Gallery</Text>
          </Pressable>
        </View>
      </View>

      <Section title="Edit member profile" subtitle="Membership and payment history will not be changed">
        <FormField label="Full name *" icon="person-outline" value={name} onChangeText={setName} autoCapitalize="words" />
        <Text style={styles.groupLabel}>Gender</Text>
        <View style={styles.chipRow}>
          {(['Male', 'Female', 'Other'] as Gender[]).map((item) => (
            <Chip key={item} label={item} selected={gender === item} onPress={() => setGender(item)} />
          ))}
        </View>
        <FormField label="Mobile number *" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <FormField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <FormField label="Date of birth" icon="gift-outline" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD (optional)" />
        <FormField label="Address" icon="location-outline" value={address} onChangeText={setAddress} multiline />
        <FormField label="Notes" icon="document-text-outline" value={notes} onChangeText={setNotes} multiline />
      </Section>

      <PrimaryButton label="Save profile changes" icon="checkmark-circle" loading={saving} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoArea: { alignItems: 'center', paddingVertical: 20 },
  cameraButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.emeraldDark,
    marginTop: -28,
    marginLeft: 82,
    borderWidth: 3,
    borderColor: palette.canvas,
  },
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  photoAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: palette.emeraldSoft },
  photoActionText: { color: palette.emeraldDark, fontSize: 12, fontWeight: '800' },
  groupLabel: { color: palette.inkSoft, fontWeight: '700', fontSize: 13, marginBottom: 9 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 17 },
});
