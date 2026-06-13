import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  EmptyState,
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
  toggleAttendance,
  updateMemberStatus,
} from '@/lib/database';
import { daysUntil, formatCurrency, formatDate } from '@/lib/format';
import { palette, radii, shadows } from '@/lib/theme';
import type { MemberDetail } from '@/lib/types';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character);
}

export default function MemberDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const memberId = Number(params.id);
  const db = useSQLiteContext();
  const { revision, refreshData } = useAppData();
  const [member, setMember] = useState<MemberDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);

  const load = useCallback(async () => {
    setMember(await getMemberDetail(db, memberId));
  }, [db, memberId]);

  useFocusEffect(useCallback(() => {
    void revision;
    load();
  }, [load, revision]));

  const markAttendance = async () => {
    if (!member) return;
    setBusy(true);
    await toggleAttendance(db, member.id);
    refreshData();
    await load();
    setBusy(false);
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
            await updateMemberStatus(db, member.id, nextStatus);
            refreshData();
            await load();
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
    if (!member || !confirmAction) return;
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
      setBusy(false);
    }
  };

  const shareInvoice = async () => {
    if (!member) return;
    setBusy(true);
    try {
      const gym = await getGymProfile(db);
      const paymentRows = member.payments.map((payment) => `
        <tr>
          <td>${formatDate(payment.paid_at)}</td>
          <td>${escapeHtml(payment.method)}</td>
          <td style="text-align:right">${formatCurrency(payment.amount)}</td>
        </tr>
      `).join('');
      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: Arial, sans-serif; color: #0B1320; padding: 32px; }
              .header { display: flex; justify-content: space-between; border-bottom: 3px solid #08785A; padding-bottom: 20px; }
              .brand { font-size: 26px; font-weight: 800; } .muted { color: #7C8796; }
              .title { margin: 30px 0 18px; font-size: 20px; }
              .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: #F4F6F8; padding: 20px; border-radius: 14px; }
              .label { color: #7C8796; font-size: 11px; } .value { font-size: 15px; font-weight: 700; margin-top: 4px; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; }
              th, td { padding: 11px; border-bottom: 1px solid #E5E9EE; text-align: left; }
              th { color: #7C8796; font-size: 11px; text-transform: uppercase; }
              .total { margin-top: 24px; text-align: right; font-size: 17px; }
              .due { color: #E24D4D; font-size: 21px; font-weight: 800; }
              .footer { margin-top: 44px; color: #7C8796; font-size: 10px; text-align: center; }
            </style>
          </head>
          <body>
            <div class="header">
              <div><div class="brand">${escapeHtml(gym.gymName)}</div><div class="muted">${escapeHtml(gym.address || 'Gym membership invoice')}</div></div>
              <div style="text-align:right"><strong>MEMBERSHIP INVOICE</strong><div class="muted">${member.membership_id}</div></div>
            </div>
            <div class="title">${escapeHtml(member.name)}</div>
            <div class="grid">
              <div><div class="label">PLAN</div><div class="value">${escapeHtml(member.plan_name || 'Membership')}</div></div>
              <div><div class="label">PHONE</div><div class="value">+91 ${escapeHtml(member.phone)}</div></div>
              <div><div class="label">START DATE</div><div class="value">${formatDate(member.start_date)}</div></div>
              <div><div class="label">EXPIRY DATE</div><div class="value">${formatDate(member.end_date)}</div></div>
              <div><div class="label">PLAN TOTAL</div><div class="value">${formatCurrency(member.total_amount)}</div></div>
              <div><div class="label">AMOUNT PAID</div><div class="value">${formatCurrency(member.paid_amount)}</div></div>
            </div>
            <h3>Payment history</h3>
            <table><thead><tr><th>Date</th><th>Method</th><th style="text-align:right">Amount</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="3">No payments recorded</td></tr>'}</tbody></table>
            <div class="total">Balance due<br><span class="due">${formatCurrency(member.due_amount)}</span></div>
            <div class="footer">Generated locally by Pulse Fitness Manager</div>
          </body>
        </html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share invoice for ${member.name}`,
      });
    } catch (error) {
      Alert.alert('Could not create invoice', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

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

  const openCall = () => Linking.openURL(`tel:${member.phone}`);
  const openWhatsApp = () => Linking.openURL(`https://wa.me/91${member.phone.replace(/\D/g, '')}`);

  return (
    <Screen>
      <View style={styles.profileCard}>
        <View style={styles.profileTop}>
          <Avatar name={member.name} uri={member.photo_uri} size={82} />
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
              {membershipCancelled
                ? 'Cancelled'
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
              onPress={() => router.push(`/payment/${member.id}`)}
            />
          </View>
          <View style={styles.buttonHalf}>
            <PrimaryButton
              label="Share invoice"
              icon="share-outline"
              variant="secondary"
              loading={busy}
              onPress={shareInvoice}
            />
          </View>
        </View>
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

      <Section title="Payment history" subtitle={`${member.payments.length} recorded transaction${member.payments.length === 1 ? '' : 's'}`}>
        {member.payments.length === 0 ? (
          <Text style={styles.emptyPayment}>No payments have been recorded.</Text>
        ) : (
          member.payments.map((payment) => (
            <View key={payment.id} style={styles.paymentRow}>
              <View style={styles.paymentIcon}>
                <Ionicons name="arrow-down" size={18} color={palette.emeraldDark} />
              </View>
              <View style={styles.paymentCopy}>
                <Text style={styles.paymentMethod}>{payment.method}</Text>
                <Text style={styles.paymentDate}>{formatDate(payment.paid_at)}{payment.note ? ` · ${payment.note}` : ''}</Text>
              </View>
              <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
            </View>
          ))
        )}
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
