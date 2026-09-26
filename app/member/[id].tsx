import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  EmptyState,
  FormField,
  LoadingView,
  PrimaryButton,
  Screen,
  Section,
} from '@/components/ui-kit';
import { useAppData } from '@/contexts/app-data';
import {
  cancelMembership,
  deleteMember,
  getGymProfile,
  getMemberDetail,
  reversePayment,
  toggleAttendance,
  updateMemberStatus,
} from '@/lib/database';
import { daysUntil, formatCurrency, formatDate, todayIso } from '@/lib/format';
import { palette, radii, shadows } from '@/lib/theme';
import type { MemberDetail, Membership, Payment } from '@/lib/types';
import { buildInvoiceHtml } from '@/lib/invoice';
import { buildDuesReminder, buildRenewalReminder, buildWhatsAppUrl } from '@/lib/reminders';
import { normalizeMemberPhone } from '@/lib/member-phone';

export default function MemberDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const memberId = Number(params.id);
  const db = useSQLiteContext();
  const { revision, refreshData } = useAppData();
  const [member, setMember] = useState<MemberDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const mutationRef = useRef(false);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reminderText, setReminderText] = useState<string | null>(null);
  const [paymentToReverse, setPaymentToReverse] = useState<Payment | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const load = useCallback(async () => {
    try {
      setMember(await getMemberDetail(db, memberId));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Please try again.');
    }
  }, [db, memberId]);

  useFocusEffect(useCallback(() => {
    void revision;
    load();
  }, [load, revision]));

  const markAttendance = async () => {
    if (!member || mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      await toggleAttendance(db, member.id);
      refreshData();
      await load();
    } catch (error) {
      Alert.alert('Could not update attendance', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  const changeStatus = () => {
    if (!member) return;
    const nextStatus = member.status === 'blocked' ? 'active' : 'blocked';
    Alert.alert(
      nextStatus === 'blocked' ? 'Block this member?' : 'Reactivate this member?',
      nextStatus === 'blocked'
        ? 'The profile and history remain saved, but the member will be marked blocked.'
        : 'The member will return to active status.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextStatus === 'blocked' ? 'Block member' : 'Reactivate',
          style: nextStatus === 'blocked' ? 'destructive' : 'default',
          onPress: async () => {
            if (mutationRef.current) return;
            mutationRef.current = true;
            setBusy(true);
            try {
              await updateMemberStatus(db, member.id, nextStatus);
              refreshData();
              await load();
            } catch (error) {
              Alert.alert('Could not update status', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              mutationRef.current = false;
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmCancelMembership = () => {
    if (!member?.membership_row_id || member.membership_status !== 'active') return;
    setConfirmAction('cancel');
  };

  const confirmDeleteMember = () => {
    if (!member) return;
    setConfirmAction('delete');
  };

  const performConfirmedAction = async () => {
    if (!member || !confirmAction || mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      if (confirmAction === 'cancel') {
        if (!member.membership_row_id) return;
        await cancelMembership(db, member.id, member.membership_row_id);
        setConfirmAction(null);
        refreshData();
        await load();
        Alert.alert('Membership cancelled', 'This membership no longer contributes to pending dues.');
      } else {
        await deleteMember(db, member.id);
        setConfirmAction(null);
        refreshData();
        router.replace('/members');
      }
    } catch (error) {
      Alert.alert(
        confirmAction === 'cancel' ? 'Could not cancel membership' : 'Could not delete member',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  const shareInvoice = async (period?: Membership) => {
    if (!member || !period) return;
    setBusy(true);
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('PDF sharing is unavailable on this device.');
      const gym = await getGymProfile(db);
      const html = buildInvoiceHtml(gym, member, period, member.payments);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Share ${period.plan_name} invoice for ${member.name}` });
    } catch (error) {
      Alert.alert('Could not share invoice', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const prepareReminder = async (kind: 'dues' | 'renewal', period?: Membership) => {
    if (!member) return;
    setBusy(true);
    try {
      const gym = await getGymProfile(db);
      const text = kind === 'dues'
        ? buildDuesReminder(gym, member)
        : period ? buildRenewalReminder(gym, member, period) : '';
      buildWhatsAppUrl(member.phone, text);
      setReminderText(text);
    } catch (error) {
      Alert.alert('Could not prepare reminder', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const openContact = async (kind: 'call' | 'whatsapp', text = '') => {
    if (!member) return;
    try {
      const url = kind === 'call' ? `tel:+91${normalizeMemberPhone(member.phone)}` : buildWhatsAppUrl(member.phone, text);
      await Linking.openURL(url);
      if (text) setReminderText(null);
    } catch (error) {
      Alert.alert('Could not open app', error instanceof Error ? error.message : 'Check that a calling or messaging app is available.');
    }
  };

  const confirmReversal = async () => {
    if (!member || !paymentToReverse || mutationRef.current) return;
    if (!reversalReason.trim()) {
      Alert.alert('Reason required', 'Explain why this payment is being reversed.');
      return;
    }
    mutationRef.current = true;
    setBusy(true);
    try {
      await reversePayment(db, member.id, paymentToReverse.id, reversalReason.trim());
      setPaymentToReverse(null);
      setReversalReason('');
      refreshData();
      await load();
    } catch (error) {
      Alert.alert('Could not reverse payment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };

  if (loadError) return <Screen><EmptyState icon="alert-circle-outline" title="Could not load member" message={loadError} /><PrimaryButton label="Try again" onPress={load} /></Screen>;
  if (member === undefined) return <Screen><LoadingView /></Screen>;
  if (member === null) {
    return (
      <Screen>
        <EmptyState icon="person-outline" title="Member not found" message="This profile may have been archived or removed." />
      </Screen>
    );
  }

  const remainingDays = daysUntil(member.end_date);
  const planExpired = remainingDays !== null && remainingDays < 0;
  const membershipCancelled = member.membership_status === 'cancelled';
  const paymentProgress = member.total_amount > 0
    ? Math.min(100, Math.round((member.paid_amount / member.total_amount) * 100))
    : 0;

  const openCall = () => openContact('call');
  const openWhatsApp = () => openContact('whatsapp');

  return (
    <Screen>
      <View style={styles.profileCard}>
        <View style={styles.profileTop}>
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={member.photo_uri ? 'Open profile photo' : 'Profile photo'}
            disabled={!member.photo_uri}
            onPress={() => setPhotoViewerOpen(true)}>
            <Avatar name={member.name} uri={member.photo_uri} size={82} />
          </Pressable>
          <View style={styles.profileCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{member.name}</Text>
              <View style={[styles.statusPill, member.status === 'blocked' && styles.blockedPill]}>
                <Text style={[styles.statusText, member.status === 'blocked' && styles.blockedText]}>
                  {member.status === 'blocked' ? 'Blocked' : 'Active'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit member profile and photo"
                onPress={() => router.push(`/member/edit/${member.id}`)}
                style={styles.editProfileButton}>
                <Ionicons name="pencil" size={16} color={palette.white} />
              </Pressable>
            </View>
            <Text style={styles.memberId}>{member.membership_id} · +91 {member.phone}</Text>
            <Text style={styles.address}>{member.address || 'No address added'}</Text>
          </View>
        </View>
        <View style={styles.quickActions}>
          <QuickAction icon="call" label="Call" onPress={openCall} />
          <QuickAction icon="logo-whatsapp" label="WhatsApp" onPress={openWhatsApp} />
          <QuickAction
            icon={member.attended_today ? 'checkmark-circle' : 'finger-print'}
            label={member.attended_today ? 'Present' : 'Check in'}
            active={member.attended_today === 1}
            onPress={markAttendance}
          />
          <QuickAction
            icon={member.status === 'blocked' ? 'refresh' : 'ban'}
            label={member.status === 'blocked' ? 'Reactivate' : 'Block'}
            onPress={changeStatus}
          />
        </View>
      </View>

      <Section title="Total outstanding" subtitle="Unpaid balances across all membership periods">
        <Text style={styles.lifetimeDue}>{formatCurrency(member.lifetime_due_amount)}</Text>
        <PrimaryButton label="Draft dues reminder" icon="logo-whatsapp" variant="secondary" disabled={member.lifetime_due_amount <= 0 || busy} onPress={() => prepareReminder('dues')} />
      </Section>

      <Section
        title={member.plan_name || 'Membership'}
        subtitle={`${formatDate(member.start_date)} to ${formatDate(member.end_date)}`}
        action={
          <View style={[
            styles.expiryBadge,
            (planExpired || membershipCancelled) && styles.expiredBadge,
          ]}>
            <Text style={[
              styles.expiryText,
              (planExpired || membershipCancelled) && styles.expiredText,
            ]}>
              {!member.membership_row_id ? 'Not assigned' : membershipCancelled
                ? 'Cancelled'
                : member.membership_status === 'frozen' ? 'Frozen'
                : member.start_date && member.start_date > todayIso() ? `Starts ${formatDate(member.start_date)}`
                : planExpired
                  ? 'Expired'
                  : remainingDays === 0
                    ? 'Ends today'
                    : `${remainingDays} days left`}
            </Text>
          </View>
        }>
        <View style={styles.amountGrid}>
          <Amount label="Plan amount" value={formatCurrency(member.base_amount)} />
          <Amount label="Discount" value={formatCurrency(member.discount_amount)} />
          <Amount label="Admission fee" value={formatCurrency(member.admission_fee)} />
          <Amount label="Paid" value={formatCurrency(member.paid_amount)} />
          <Amount label="Total" value={formatCurrency(member.total_amount)} />
          <Amount label="Balance due" value={formatCurrency(member.due_amount)} danger={member.due_amount > 0} />
        </View>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Payment progress</Text>
          <Text style={styles.progressPercent}>{paymentProgress}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${paymentProgress}%` }]} />
        </View>
        {(member.membership_status !== 'active' || planExpired) && (
          <View style={styles.renewButton}>
            <PrimaryButton
              label="Assign new membership plan"
              icon="refresh-circle"
              onPress={() => router.push(`/membership/${member.id}` as never)}
            />
          </View>
        )}
        {member.membership_status === 'active' && !planExpired && (
          <View style={styles.renewButton}>
            <PrimaryButton
              label="Change current plan"
              icon="swap-horizontal"
              variant="secondary"
              onPress={() => router.push(`/membership/${member.id}?mode=change` as never)}
            />
          </View>
        )}
        <View style={styles.buttonRow}>
          <View style={styles.buttonHalf}>
            <PrimaryButton
              label={
                membershipCancelled
                  ? 'Membership cancelled'
                  : member.due_amount > 0
                    ? 'Add payment'
                    : 'Fully paid'
              }
              icon="card-outline"
              disabled={member.due_amount <= 0 || membershipCancelled}
              onPress={() => router.push(`/payment/${member.id}?membershipId=${member.membership_row_id}` as never)}
            />
          </View>
          <View style={styles.buttonHalf}>
            <PrimaryButton
              label="Share invoice"
              icon="share-outline"
              variant="secondary"
              loading={busy}
              disabled={!member.memberships[0]}
              onPress={() => shareInvoice(member.memberships[0])}
            />
          </View>
        </View>
      </Section>

      <Section title="Membership periods" subtitle="Choose the exact period when recording payment or sharing an invoice">
        {member.memberships.length === 0 && <Text style={styles.emptyPayment}>No membership periods recorded.</Text>}
        {member.memberships.map((period) => (
          <View key={period.id} style={styles.periodCard}>
            <Text style={styles.periodTitle}>{period.plan_name} · {period.status === 'active' ? period.start_date > todayIso() ? 'upcoming' : period.end_date < todayIso() ? 'expired' : 'active' : period.status}</Text>
            <Text style={styles.periodMeta}>{formatDate(period.start_date)} to {formatDate(period.end_date)} · #{period.id}</Text>
            <View style={styles.amountGrid}>
              <Amount label="Total" value={formatCurrency(period.total_amount)} />
              <Amount label="Paid" value={formatCurrency(period.paid_amount)} />
              <Amount label="Due" value={formatCurrency(period.due_amount)} danger={period.due_amount > 0} />
            </View>
            <View style={styles.periodActions}>
              {period.status !== 'cancelled' && period.due_amount > 0 && <Pressable accessibilityRole="button" disabled={busy} style={styles.periodAction} onPress={() => router.push(`/payment/${member.id}?membershipId=${period.id}` as never)}><Text style={styles.periodActionText}>Add payment</Text></Pressable>}
              <Pressable accessibilityRole="button" disabled={busy} style={styles.periodAction} onPress={() => shareInvoice(period)}><Text style={styles.periodActionText}>Share invoice</Text></Pressable>
              {period.status !== 'cancelled' && <Pressable accessibilityRole="button" disabled={busy} style={styles.periodAction} onPress={() => prepareReminder('renewal', period)}><Text style={styles.periodActionText}>Renewal draft</Text></Pressable>}
            </View>
          </View>
        ))}
      </Section>

      <Section title="Member details">
        <DetailRow icon="male-female-outline" label="Gender" value={member.gender} />
        <DetailRow icon="mail-outline" label="Email" value={member.email || 'Not added'} />
        <DetailRow icon="gift-outline" label="Date of birth" value={formatDate(member.date_of_birth)} />
        <DetailRow icon="calendar-outline" label="Joined" value={formatDate(member.joined_at)} />
        <DetailRow
          icon="walk-outline"
          label="Total attendance"
          value={`${member.attendance_count} ${member.attendance_count === 1 ? 'day' : 'days'}`}
        />
        {!!member.notes && <DetailRow icon="document-text-outline" label="Notes" value={member.notes} />}
      </Section>

      <Section title="Payment audit history" subtitle="Reversed entries stay visible and are excluded from balances and collections">
        {member.payments.length === 0 ? <Text style={styles.emptyPayment}>No payments have been recorded.</Text> : member.payments.map((payment) => (
          <View key={payment.id} style={styles.auditCard}>
            <View style={styles.paymentRow}>
              <View style={[styles.paymentIcon, payment.voided_at ? styles.voidIcon : null]}>
                <Ionicons name={payment.voided_at ? 'return-up-back' : 'arrow-down'} size={18} color={payment.voided_at ? palette.red : palette.emeraldDark} />
              </View>
              <View style={styles.paymentCopy}>
                <Text style={styles.paymentMethod}>{payment.method} · Receipt #{payment.id}</Text>
                <Text style={styles.paymentDate}>{formatDate(payment.paid_at)} · Period #{payment.membership_id}</Text>
                {!!payment.note && <Text style={styles.paymentDate}>{payment.note}</Text>}
              </View>
              <Text style={[styles.paymentAmount, payment.voided_at ? styles.voidAmount : null]}>{formatCurrency(payment.amount)}</Text>
            </View>
            {payment.voided_at ? <View style={styles.voidDetail}><Text style={styles.voidLabel}>Reversed · {formatDate(payment.voided_at.slice(0, 10))}</Text><Text style={styles.paymentDate}>{payment.void_reason}</Text></View> : (
              <Pressable accessibilityRole="button" accessibilityLabel={`Reverse payment ${payment.id}`} disabled={busy} onPress={() => { setPaymentToReverse(payment); setReversalReason(''); }} style={styles.reverseAction}><Text style={styles.deleteButtonText}>Reverse incorrect payment</Text></Pressable>
            )}
          </View>
        ))}
      </Section>

      <Section
        title="Member actions"
        subtitle="Use cancellation to remove an unpaid balance without losing the member history">
        {member.membership_status === 'active' && (
          <View style={styles.destructiveAction}>
            <View style={[styles.destructiveIcon, { backgroundColor: palette.amberSoft }]}>
              <Ionicons name="close-circle-outline" size={22} color={palette.amber} />
            </View>
            <View style={styles.destructiveCopy}>
              <Text style={styles.destructiveTitle}>Cancel membership</Text>
              <Text style={styles.destructiveMeta}>
                Clears {formatCurrency(member.due_amount)} from pending dues and keeps all history.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel membership"
              disabled={busy}
              onPress={confirmCancelMembership}
              style={styles.destructiveButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.destructiveAction}>
          <View style={[styles.destructiveIcon, { backgroundColor: palette.redSoft }]}>
            <Ionicons name="trash-outline" size={22} color={palette.red} />
          </View>
          <View style={styles.destructiveCopy}>
            <Text style={styles.destructiveTitle}>Delete member permanently</Text>
            <Text style={styles.destructiveMeta}>
              Removes the profile, payments, memberships, and attendance.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete member permanently"
            disabled={busy}
            onPress={confirmDeleteMember}
            style={[styles.destructiveButton, styles.deleteButton]}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </View>
      </Section>

      <Modal animationType="slide" transparent visible={reminderText !== null} onRequestClose={() => setReminderText(null)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
          <View style={styles.draftCard}>
            <Text style={styles.confirmTitle}>Review WhatsApp draft</Text>
            <Text style={styles.confirmMessage}>Review the details before opening WhatsApp. You choose when to send the message.</Text>
            <FormField label="Message" value={reminderText ?? ''} onChangeText={setReminderText} multiline style={styles.draftInput} />
            <PrimaryButton label="Open WhatsApp draft" icon="logo-whatsapp" disabled={!reminderText?.trim()} onPress={() => openContact('whatsapp', reminderText ?? '')} />
            <Pressable onPress={() => setReminderText(null)} style={styles.keepButton}><Text style={styles.keepButtonText}>Close draft</Text></Pressable>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" transparent visible={paymentToReverse !== null} onRequestClose={() => !busy && setPaymentToReverse(null)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
          <View style={styles.draftCard}>
            <Text style={styles.confirmTitle}>Reverse {formatCurrency(paymentToReverse?.amount ?? 0)} payment?</Text>
            <Text style={styles.confirmMessage}>Receipt #{paymentToReverse?.id} will remain in the audit history. Collections and this period’s balance will be recalculated. This does not send a refund.</Text>
            <FormField label="Reason for reversal *" value={reversalReason} onChangeText={setReversalReason} multiline placeholder="For example: duplicate entry or incorrect amount" />
            <PrimaryButton label="Confirm reversal" icon="return-up-back" variant="danger" loading={busy} disabled={!reversalReason.trim()} onPress={confirmReversal} />
            <Pressable disabled={busy} onPress={() => setPaymentToReverse(null)} style={styles.keepButton}><Text style={styles.keepButtonText}>Keep payment</Text></Pressable>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={photoViewerOpen}
        onRequestClose={() => setPhotoViewerOpen(false)}>
        <View style={styles.photoViewerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoViewerOpen(false)} />
          <View style={styles.photoViewerCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close profile photo"
              onPress={() => setPhotoViewerOpen(false)}
              style={styles.photoViewerClose}>
              <Ionicons name="close" size={22} color={palette.white} />
            </Pressable>
            {!!member.photo_uri && (
              <Image
                source={{ uri: member.photo_uri }}
                contentFit="contain"
                style={styles.photoViewerImage}
              />
            )}
            <Text style={styles.photoViewerName}>{member.name}</Text>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={confirmAction !== null}
        onRequestClose={() => !busy && setConfirmAction(null)}>
        <View style={styles.confirmBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            disabled={busy}
            onPress={() => setConfirmAction(null)}
          />
          <View style={styles.confirmCard}>
            <View style={[
              styles.confirmIcon,
              { backgroundColor: confirmAction === 'delete' ? palette.redSoft : palette.amberSoft },
            ]}>
              <Ionicons
                name={confirmAction === 'delete' ? 'trash-outline' : 'close-circle-outline'}
                size={27}
                color={confirmAction === 'delete' ? palette.red : palette.amber}
              />
            </View>
            <Text style={styles.confirmTitle}>
              {confirmAction === 'delete' ? 'Permanently delete member?' : 'Cancel this membership?'}
            </Text>
            <Text style={styles.confirmMessage}>
              {confirmAction === 'delete'
                ? `This permanently removes ${member.name}, all memberships, ${member.payments.length} payment record${member.payments.length === 1 ? '' : 's'}, and attendance history. This cannot be undone.`
                : `The remaining ${formatCurrency(member.due_amount)} will be removed from pending dues. The member profile and received payments will stay saved.`}
            </Text>
            <PrimaryButton
              label={confirmAction === 'delete' ? 'Delete permanently' : 'Cancel membership'}
              icon={confirmAction === 'delete' ? 'trash-outline' : 'close-circle-outline'}
              variant="danger"
              loading={busy}
              onPress={performConfirmedAction}
            />
            <Pressable
              disabled={busy}
              onPress={() => setConfirmAction(null)}
              style={styles.keepButton}>
              <Text style={styles.keepButtonText}>
                {confirmAction === 'delete' ? 'Keep member' : 'Keep membership'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={[styles.quickIcon, active && styles.quickIconActive]}>
        <Ionicons name={icon} size={20} color={active ? palette.white : palette.inkSoft} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function Amount({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.amountItem}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, danger && { color: palette.red }]}>{value}</Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={19} color={palette.emeraldDark} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lifetimeDue: { color: palette.ink, fontSize: 30, fontWeight: '900', marginBottom: 16 },
  periodCard: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: palette.line },
  periodTitle: { color: palette.ink, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  periodMeta: { color: palette.muted, fontSize: 12, marginTop: 5, marginBottom: 12 },
  periodActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  periodAction: { padding: 12, borderRadius: radii.pill, backgroundColor: palette.emeraldSoft },
  periodActionText: { color: palette.emeraldDark, fontSize: 12, fontWeight: '800' },
  auditCard: { paddingBottom: 12, marginBottom: 8, borderBottomColor: palette.line, borderBottomWidth: 1 },
  voidIcon: { backgroundColor: palette.redSoft },
  voidAmount: { color: palette.muted, textDecorationLine: 'line-through' },
  voidDetail: { paddingLeft: 49, paddingTop: 4 },
  voidLabel: { color: palette.red, fontWeight: '800', fontSize: 12 },
  reverseAction: { alignSelf: 'flex-end', padding: 10 },
  draftCard: { backgroundColor: palette.card, borderRadius: radii.xl, padding: 22 },
  draftInput: { flex: 1, color: palette.ink, fontSize: 14, minHeight: 160, maxHeight: 240, textAlignVertical: 'top' },
  modalScroll: { flexGrow: 0, width: '100%' },
  modalContent: { paddingVertical: 24 },
  profileCard: { backgroundColor: palette.ink, borderRadius: radii.xl, padding: 20, marginTop: 10, marginBottom: 16, ...shadows.card },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  profileCopy: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, color: palette.white, fontSize: 23, fontWeight: '900' },
  memberId: { color: '#B8C3CB', fontSize: 12, marginTop: 6 },
  address: { color: '#D8DEE3', fontSize: 12, marginTop: 5 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: 'rgba(20,184,122,0.18)' },
  blockedPill: { backgroundColor: 'rgba(226,77,77,0.2)' },
  statusText: { color: palette.lime, fontSize: 10, fontWeight: '800' },
  blockedText: { color: '#FF9B9B' },
  editProfileButton: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  photoViewerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(2,6,12,0.92)',
  },
  photoViewerCard: { alignItems: 'center' },
  photoViewerClose: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: 14,
  },
  photoViewerImage: { width: '100%', aspectRatio: 1, borderRadius: radii.xl, backgroundColor: 'rgba(255,255,255,0.06)' },
  photoViewerName: { color: palette.white, fontSize: 18, fontWeight: '900', marginTop: 16 },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 20, marginTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  quickAction: { flex: 1, alignItems: 'center' },
  quickIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  quickIconActive: { backgroundColor: palette.emerald },
  quickLabel: { color: '#D6DDE2', fontSize: 10, fontWeight: '700', marginTop: 7 },
  expiryBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.pill, backgroundColor: palette.emeraldSoft },
  expiredBadge: { backgroundColor: palette.redSoft },
  expiryText: { color: palette.emeraldDark, fontSize: 10, fontWeight: '800' },
  expiredText: { color: palette.red },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  amountItem: { width: '47%', padding: 14, borderRadius: radii.md, backgroundColor: palette.canvas },
  amountLabel: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  amountValue: { color: palette.ink, fontSize: 17, fontWeight: '900', marginTop: 5 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  progressLabel: { color: palette.inkSoft, fontSize: 12, fontWeight: '700' },
  progressPercent: { color: palette.emeraldDark, fontSize: 12, fontWeight: '900' },
  progressTrack: { height: 9, backgroundColor: palette.canvas, borderRadius: 5, overflow: 'hidden' },
  progressBar: { height: 9, backgroundColor: palette.emerald, borderRadius: 5 },
  renewButton: { marginTop: 18 },
  buttonRow: { flexDirection: 'row', gap: 9, marginTop: 18 },
  buttonHalf: { flex: 1 },
  detailRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.line },
  detailIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.emeraldSoft },
  detailCopy: { flex: 1 },
  detailLabel: { color: palette.muted, fontSize: 11 },
  detailValue: { color: palette.ink, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 3 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.line },
  paymentIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.emeraldSoft },
  paymentCopy: { flex: 1 },
  paymentMethod: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  paymentDate: { color: palette.muted, fontSize: 10, marginTop: 4 },
  paymentAmount: { color: palette.emeraldDark, fontSize: 15, fontWeight: '900' },
  emptyPayment: { color: palette.muted, textAlign: 'center', paddingVertical: 16 },
  destructiveAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  destructiveIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveCopy: { flex: 1 },
  destructiveTitle: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  destructiveMeta: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  destructiveButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: palette.amberSoft,
  },
  deleteButton: { backgroundColor: palette.redSoft },
  cancelButtonText: { color: '#A45F08', fontSize: 11, fontWeight: '800' },
  deleteButtonText: { color: palette.red, fontSize: 11, fontWeight: '800' },
  confirmBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(11,19,32,0.62)',
  },
  confirmCard: {
    alignItems: 'center',
    padding: 22,
    borderRadius: radii.xl,
    backgroundColor: palette.card,
    ...shadows.card,
  },
  confirmIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: { color: palette.ink, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  confirmMessage: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 9,
    marginBottom: 20,
  },
  keepButton: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 20, marginTop: 7 },
  keepButtonText: { color: palette.inkSoft, fontSize: 13, fontWeight: '800' },
});
