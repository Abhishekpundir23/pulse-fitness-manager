import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInvoiceHtml, getMembershipInvoice } from '../lib/invoice.ts';
import type { GymProfile, Membership, Payment } from '../lib/types.ts';

const member = { id: 7, name: 'Asha <script>alert(1)</script>', phone: '9876543210', membership_id: 'PF-0007' };
const gym: GymProfile = { gymName: 'Fit & Strong', ownerName: 'Ravi', phone: '9876543211', email: 'fit@example.com', address: 'Road <2>' };
const period: Membership = { id: 11, member_id: 7, plan_id: 1, plan_name: 'Old Gold', start_date: '2026-01-01', end_date: '2026-01-31', base_amount: 1500, discount_amount: 100, admission_fee: 200, total_amount: 1600, paid_amount: 9999, due_amount: 9999, status: 'expired' };
const payments: Payment[] = [
  { id: 1, member_id: 7, membership_id: 11, amount: 400.25, method: 'UPI', paid_at: '2026-01-02', note: null, created_at: '2026-01-02', voided_at: null, void_reason: null },
  { id: 2, member_id: 7, membership_id: 12, amount: 2000, method: 'Card', paid_at: '2026-02-01', note: null, created_at: '2026-02-01', voided_at: null, void_reason: null },
  { id: 3, member_id: 7, membership_id: 11, amount: 500, method: 'Cash', paid_at: '2026-01-03', note: null, created_at: '2026-01-03', voided_at: '2026-01-04', void_reason: 'Duplicate' },
];

test('a selected historical invoice uses its own charges and only its live payment rows', () => {
  const invoice = getMembershipInvoice(member, period, payments);
  assert.deepEqual(invoice.payments.map((payment) => payment.id), [1]);
  assert.equal(invoice.totalAmount, 1600);
  assert.equal(invoice.paidAmount, 400.25);
  assert.equal(invoice.dueAmount, 1199.75);
  assert.equal(invoice.membership.plan_name, 'Old Gold');
});

test('cancelled invoice retains charges and live receipts but does not request payment', () => {
  const invoice = getMembershipInvoice(member, { ...period, status: 'cancelled' }, payments);
  assert.equal(invoice.totalAmount, 1600);
  assert.equal(invoice.paidAmount, 400.25);
  assert.equal(invoice.dueAmount, 0);
});

test('an invoice cannot accidentally be generated for a different member', () => {
  assert.throws(() => getMembershipInvoice(member, { ...period, member_id: 8 }, payments), /member/i);
});

test('PDF HTML preserves exact amounts and escapes user input without leaking other receipts', () => {
  const html = buildInvoiceHtml(gym, member, period, payments);
  assert.ok(html.includes('Fit &amp; Strong'));
  assert.ok(html.includes('Asha &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('1,199.75'));
  assert.ok(html.includes('400.25'));
  assert.ok(html.includes('Old Gold'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('>Card<'));
  assert.ok(!html.includes('>Cash<'));
});
