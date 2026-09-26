import assert from 'node:assert/strict';
import test from 'node:test';

import { previewMemberImport, MEMBER_CSV_HEADER } from '../lib/member-import.ts';

const plans = [{ id: 4, name: 'Owner custom plan', duration_months: 2, amount: 950, active: 1 }];
const header = 'name,phone,gender,plan_name,start_date,paid_amount,payment_method,discount,admission_fee,email,address,notes';
const row = 'Asha,+91 98765 43210,Female,Owner custom plan,2026-09-01,400,UPI,50,100,,Delhi,Evening';

test('CSV preview preserves quoted commas, multiline notes and computes owner plan balance', () => {
  const preview = previewMemberImport(`\ufeff${header}\r\n"Asha, Sharma",9876543210,Female,Owner custom plan,2026-09-01,400,UPI,50,100,,Delhi,"line one\nline ""two"""\r\n`, plans, []);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].input.name, 'Asha, Sharma');
  assert.equal(preview.rows[0].input.notes, 'line one\nline "two"');
  assert.equal(preview.rows[0].input.planId, 4);
  assert.equal(preview.rows[0].total, 1000);
  assert.equal(preview.rows[0].due, 600);
  assert.equal(preview.totalPaid, 400);
});

test('duplicate phones within a file or already on device block the entire preview', () => {
  const preview = previewMemberImport(`${header}\n${row}\n${row.replace('Asha', 'Bob')}`, plans, ['9876543210']);
  assert.equal(preview.canImport, false);
  assert.match(preview.errors.join(' '), /already exists/);
  assert.match(preview.errors.join(' '), /repeated/);
});

test('missing, inactive and ambiguous owner plans are never silently selected', () => {
  for (const available of [[], [{ ...plans[0], active: 0 }], [plans[0], { ...plans[0], id: 8 }]]) {
    const preview = previewMemberImport(`${header}\n${row}`, available, []);
    assert.equal(preview.canImport, false);
    assert.match(preview.errors.join(' '), /plan/i);
  }
});

test('invalid dates, nonfinite and negative money and overpayment cannot enter the ledger', () => {
  for (const changed of [
    row.replace('2026-09-01', '2026-02-30'),
    row.replace(',400,', ',Infinity,'),
    row.replace(',400,', ',-1,'),
    row.replace(',400,', ',1001,'),
    row.replace(',400,', ',1e2,'),
    row.replace(',UPI,', ',Crypto,'),
    row.replace('2026-09-01', '2099-09-01'),
    row.replace('+91 98765 43210', '1234567890'),
  ]) {
    const preview = previewMemberImport(`${header}\n${changed}`, plans, []);
    assert.equal(preview.canImport, false, changed);
    assert.ok(preview.errors.length);
  }
});

test('malformed quotes, duplicate headers, wrong column count and oversized batches fail clearly', () => {
  for (const csv of [
    `${header}\n"unterminated`,
    `${header}\n"Asha"oops,9876543210`,
    `${header},name\n${row},Asha`,
    `${header}\nAsha,9876543210`,
    `${header}\n${Array.from({ length: 501 }, () => row).join('\n')}`,
  ]) {
    const preview = previewMemberImport(csv, plans, []);
    assert.equal(preview.canImport, false);
    assert.ok(preview.errors.length);
  }
});

test('template has no fake members and valid +91 phone numbers normalize before duplicate checks', () => {
  assert.equal(previewMemberImport(MEMBER_CSV_HEADER, plans, []).canImport, false);
  const preview = previewMemberImport(`${header}\n${row}`, plans, []);
  assert.equal(preview.canImport, true);
  assert.equal(preview.rows[0].input.phone, '9876543210');
});
