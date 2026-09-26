import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPaymentHistoryQuery } from '../lib/payment-query.ts';

test('all-time payment query has no date restriction or limit', () => {
  const query = buildPaymentHistoryQuery({ search: '', month: null, method: 'all' });
  assert.doesNotMatch(query.sql, /LIMIT 10/);
  assert.doesNotMatch(query.sql, /BETWEEN/);
});

test('payment query filters a selected month inclusively', () => {
  const query = buildPaymentHistoryQuery({ search: '', month: '2026-06', method: 'all' });
  assert.match(query.sql, /p\.paid_at BETWEEN \? AND \?/);
  assert.deepEqual(query.args.slice(-2), ['2026-06-01', '2026-06-30']);
});

test('payment query filters member identity and payment method', () => {
  const query = buildPaymentHistoryQuery({ search: 'PF-0042', month: null, method: 'UPI' });
  assert.match(query.sql, /m\.membership_id LIKE \?/);
  assert.match(query.sql, /p\.method = \?/);
  assert.ok(query.args.includes('%PF-0042%'));
  assert.ok(query.args.includes('UPI'));
});

test('current-month history stops at today to agree with monthly reports', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-15T12:00:00').getTime() });
  try {
    const query = buildPaymentHistoryQuery({ search: '', month: '2026-06', method: 'all' });
    assert.deepEqual(query.args.slice(-2), ['2026-06-01', '2026-06-15']);
  } finally { context.mock.timers.reset(); }
});
