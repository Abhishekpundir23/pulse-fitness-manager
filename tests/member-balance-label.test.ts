import assert from 'node:assert/strict';
import test from 'node:test';
import { memberBalanceLabel } from '../lib/member-presentation.ts';

test('an older balance remains visible when the latest membership was cancelled or has not started', () => {
  assert.equal(memberBalanceLabel(300, 'cancelled'), '₹300 due');
  assert.equal(memberBalanceLabel(120.5, 'none'), '₹120.5 due');
  assert.equal(memberBalanceLabel(0, 'cancelled'), 'No due');
  assert.equal(memberBalanceLabel(0, 'active'), 'Paid');
});
