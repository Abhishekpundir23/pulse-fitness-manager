import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  Chip,
  DateField,
  FormField,
  LoadingView,
  PrimaryButton,
  Screen,
  Section,
} from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import { createMember, getPlans } from '@/lib/database';
import { formatCurrency, todayIso } from '@/lib/format';
import { persistMemberPhoto } from '@/lib/member-photo';
import { palette, radii } from '@/lib/theme';
import type { Gender, PaymentMethod, Plan } from '@/lib/types';

export default function NewMemberScreen() {
  const db = useSQLiteContext();
  const { refreshData } = useAppData();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('Male');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [planId, setPlanId] = useState<number | null>(null);
  const [joiningDate, setJoiningDate] = useState(todayIso());
  const [discount, setDiscount] = useState('');
  const [admissionFee, setAdmissionFee] = useState('');
  const [initialPayment, setInitialPayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');

  useEffect(() => {
    getPlans(db).then((rows) => {
      setPlans(rows);
      setPlanId(rows[0]?.id ?? null);
    });
  }, [db]);

  const selectedPlan = plans?.find((plan) => plan.id === planId);
  const total = useMemo(() => {
    return Math.max(
      0,
      (selectedPlan?.amount ?? 0) - (Number(discount) || 0) + (Number(admissionFee) || 0),
    );
  }, [selectedPlan, discount, admissionFee]);
  const due = Math.max(0, total - (Number(initialPayment) || 0));

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
      Alert.alert(
        'Camera permission needed',
        'Allow camera access to take a member profile photo.',
      );
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
    Alert.alert('Member photo', 'Choose how to add the profile photo.', [
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
    if (!planId) {
      Alert.alert('Plan required', 'Choose a membership plan.');
      return;
    }
    if ((Number(initialPayment) || 0) > total) {
      Alert.alert('Payment is too high', 'Initial payment cannot exceed the final plan amount.');
      return;
    }

    setSaving(true);
    try {
      const memberId = await createMember(db, {
        name,
        gender,
        phone: cleanPhone,
        email,
        dateOfBirth,
        address,
        notes,
        photoUri: persistMemberPhoto(photoUri),
        planId,
        joiningDate,
        discountAmount: Number(discount) || 0,
        admissionFee: Number(admissionFee) || 0,
        initialPayment: Number(initialPayment) || 0,
        paymentMethod,
      });
      refreshData();
      router.replace(`/member/${memberId}`);
    } catch (error) {
      Alert.alert('Could not add member', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!plans) return <Screen><LoadingView /></Screen>;

  return (
    <Screen>
      <View style={styles.photoArea}>
        <Avatar name={name || 'New Member'} uri={photoUri} size={104} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add member photo"
          style={styles.cameraButton}
          onPress={choosePhotoSource}>
          <Ionicons name="camera" size={20} color={palette.white} />
        </Pressable>
        <View style={styles.photoActions}>
          <Pressable onPress={takePhoto} style={styles.photoAction}>
            <Ionicons name="camera-outline" size={17} color={palette.emeraldDark} />
            <Text style={styles.photoActionText}>Take photo</Text>
          </Pressable>
          <Pressable onPress={pickPhoto} style={styles.photoAction}>
            <Ionicons name="images-outline" size={17} color={palette.emeraldDark} />
            <Text style={styles.photoActionText}>Gallery</Text>
          </Pressable>
        </View>
      </View>

      <Section title="Member profile" subtitle="Basic identity and contact information">
        <FormField label="Full name *" icon="person-outline" value={name} onChangeText={setName} placeholder="e.g. Mohit Sharma" autoCapitalize="words" />
        <Text style={styles.groupLabel}>Gender</Text>
        <View style={styles.chipRow}>
          {(['Male', 'Female', 'Other'] as Gender[]).map((item) => (
            <Chip key={item} label={item} selected={gender === item} onPress={() => setGender(item)} />
          ))}
        </View>
        <FormField label="Mobile number *" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 98765 43210" />
        <FormField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Optional" />
        <FormField label="Date of birth" icon="gift-outline" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD (optional)" />
        <FormField label="Address" icon="location-outline" value={address} onChangeText={setAddress} multiline placeholder="Home address" />
        <FormField label="Notes" icon="document-text-outline" value={notes} onChangeText={setNotes} multiline placeholder="Health notes, goals, or preferences" />
      </Section>

      <Section title="Membership plan" subtitle="Prices are stored and calculated in Indian rupees">
        <View style={styles.planGrid}>
          {plans.map((plan) => (
            <Pressable
              key={plan.id}
              onPress={() => setPlanId(plan.id)}
              style={[
                styles.planCard,
                planId === plan.id && styles.planCardSelected,
              ]}>
              <View style={[styles.planRadio, planId === plan.id && styles.planRadioSelected]}>
                {planId === plan.id && <View style={styles.planRadioDot} />}
              </View>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planAmount}>{formatCurrency(plan.amount)}</Text>
            </Pressable>
          ))}
        </View>
        <DateField label="Joining date" value={joiningDate} onChange={setJoiningDate} />
        <View style={styles.twoColumn}>
          <FormField containerStyle={styles.half} label="Discount" icon="pricetag-outline" value={discount} onChangeText={setDiscount} keyboardType="numeric" placeholder="₹0" />
          <FormField containerStyle={styles.half} label="Admission fee" icon="add-circle-outline" value={admissionFee} onChangeText={setAdmissionFee} keyboardType="numeric" placeholder="₹0" />
        </View>
      </Section>

      <Section title="Opening payment" subtitle="You can leave this at zero and collect later">
        <FormField label="Amount received" icon="cash-outline" value={initialPayment} onChangeText={setInitialPayment} keyboardType="numeric" placeholder="₹0" />
        <Text style={styles.groupLabel}>Payment method</Text>
        <View style={styles.chipRow}>
          {(['Cash', 'UPI', 'Card', 'Bank transfer'] as PaymentMethod[]).map((item) => (
            <Chip key={item} label={item} selected={paymentMethod === item} onPress={() => setPaymentMethod(item)} />
          ))}
        </View>
        <View style={styles.totalBox}>
          <View>
            <Text style={styles.totalLabel}>Final plan amount</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
          <View style={styles.totalRight}>
            <Text style={styles.totalLabel}>Balance due</Text>
            <Text style={[styles.totalValue, due > 0 && { color: palette.red }]}>{formatCurrency(due)}</Text>
          </View>
        </View>
      </Section>

      <PrimaryButton label="Create member" icon="checkmark-circle" loading={saving} onPress={save} />
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
    marginLeft: 78,
    borderWidth: 3,
    borderColor: palette.canvas,
  },
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  photoAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: palette.emeraldSoft },
  photoActionText: { color: palette.emeraldDark, fontSize: 12, fontWeight: '800' },
  groupLabel: { color: palette.inkSoft, fontWeight: '700', fontSize: 13, marginBottom: 9 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 17 },
  planGrid: { gap: 9, marginBottom: 18 },
  planCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, backgroundColor: '#FAFBFC' },
  planCardSelected: { borderColor: palette.emeraldDark, backgroundColor: palette.emeraldSoft },
  planRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  planRadioSelected: { borderColor: palette.emeraldDark },
  planRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.emeraldDark },
  planName: { flex: 1, color: palette.ink, fontSize: 15, fontWeight: '800' },
  planAmount: { color: palette.emeraldDark, fontSize: 15, fontWeight: '900' },
  twoColumn: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderRadius: radii.md, backgroundColor: palette.canvas, marginTop: 2 },
  totalRight: { alignItems: 'flex-end' },
  totalLabel: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  totalValue: { color: palette.ink, fontSize: 19, fontWeight: '900', marginTop: 5 },
});
