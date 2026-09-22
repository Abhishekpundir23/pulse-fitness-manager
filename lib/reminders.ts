import { formatDate, todayIso } from './format';
import { normalizeMemberPhone } from './member-phone';
import type { GymProfile, Membership } from './types';

type ReminderMember = { name: string; phone: string; lifetime_due_amount: number; memberships: Membership[] };
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

export function buildWhatsAppUrl(phone: string, text = '') {
  return `https://wa.me/91${normalizeMemberPhone(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

function contact(gym: GymProfile) {
  return `Please contact ${gym.ownerName.trim() || 'us'}${gym.phone.trim() ? ` at ${gym.phone.trim()}` : ''} if you need help. Thank you!`;
}

export function buildDuesReminder(gym: GymProfile, member: ReminderMember) {
  if (member.lifetime_due_amount <= 0) throw new Error('There is no outstanding membership balance.');
  const periods = member.memberships.filter((period) => period.status !== 'cancelled' && period.due_amount > 0);
  const breakdown = periods.map((period) => `${period.plan_name} (${formatDate(period.start_date)} to ${formatDate(period.end_date)}): ${money(period.due_amount)}`).join('\n');
  return `Hi ${member.name}, a friendly reminder from ${gym.gymName}.\nYour total outstanding membership balance across all periods is ${money(member.lifetime_due_amount)}.\n${breakdown}\nIf you have already paid, please share the payment details so we can update our records.\n${contact(gym)}`;
}

export function buildRenewalReminder(gym: GymProfile, member: ReminderMember, membership: Membership, today = todayIso()) {
  if (membership.status === 'cancelled') throw new Error('A cancelled membership cannot receive a renewal reminder.');
  const timing = membership.end_date < today ? 'expired on' : membership.end_date === today ? 'ends today,' : 'ends on';
  return `Hi ${member.name}, this is ${gym.gymName}.\nYour ${membership.plan_name} membership (${formatDate(membership.start_date)} to ${formatDate(membership.end_date)}) ${timing} ${formatDate(membership.end_date)}. Please contact us to renew.\n${member.lifetime_due_amount > 0 ? `Your outstanding balance across all membership periods is ${money(member.lifetime_due_amount)}.\n` : ''}${contact(gym)}`;
}
