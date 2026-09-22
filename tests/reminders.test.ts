import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDuesReminder, buildRenewalReminder, buildWhatsAppUrl } from '../lib/reminders.ts';
import type { GymProfile, Membership } from '../lib/types.ts';

const gym: GymProfile = { gymName: 'Fit & Strong', ownerName: 'Ravi', phone: '9876543211', email: '', address: '' };
const period: Membership = { id: 11, member_id: 7, plan_id: 1, plan_name: 'Gold', start_date: '2026-01-01', end_date: '2026-01-31', base_amount: 1500, discount_amount: 0, admission_fee: 0, total_amount: 1500, paid_amount: 500, due_amount: 1000, status: 'expired' };
const member = { name: 'Asha & Co', phone: '9876543210', lifetime_due_amount: 1250.5, memberships: [period, { ...period, id: 12, plan_name: 'Silver', start_date: '2026-02-01', end_date: '2026-02-28', due_amount: 250.5 }, { ...period, id: 13, plan_name: 'Cancelled plan', status: 'cancelled' as const, due_amount: 900 }] };

test('dues draft names the real gym and distinguishes total historical debt from period debt', () => {
  const text = buildDuesReminder(gym, member);
  assert.ok(text.includes('Fit & Strong'));
  assert.ok(text.includes('Asha & Co'));
  assert.ok(text.includes('1,250.5'));
  assert.ok(text.includes('Gold'));
  assert.ok(text.includes('Silver'));
  assert.ok(!text.includes('Cancelled plan'));
  assert.ok(text.includes('9876543211'));
});

test('renewal draft refers to selected expiry and still mentions debt from old periods', () => {
  const text = buildRenewalReminder(gym, member, { ...period, due_amount: 0 }, '2026-02-10');
  assert.ok(text.includes('31 Jan 2026'));
  assert.ok(text.includes('expired'));
  assert.ok(text.includes('1,250.5'));
  assert.ok(text.includes('Gold'));
});

test('settled or cancelled memberships do not generate misleading payment/renewal requests', () => {
  assert.throws(() => buildDuesReminder(gym, { ...member, lifetime_due_amount: 0 }), /no outstanding/i);
  assert.throws(() => buildRenewalReminder(gym, member, { ...period, status: 'cancelled' }), /cancelled/i);
});

test('WhatsApp drafts are safely encoded for exactly one Indian mobile recipient', () => {
  const text = 'Hi Asha & Co\n₹250? #1 + 2';
  const url = new URL(buildWhatsAppUrl('98765 43210', text));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/919876543210');
  assert.equal(url.searchParams.get('text'), text);
  assert.equal([...url.searchParams.keys()].length, 1);
  for (const phone of ['98765-43210', '+91 9876543210', '0091 9876543210']) {
    assert.equal(new URL(buildWhatsAppUrl(phone, text)).pathname, '/919876543210');
  }
  for (const phone of ['1234567890', '987654321', '98765432100', '98765abc43210']) {
    assert.throws(() => buildWhatsAppUrl(phone, text), /10-digit/i);
  }
});
