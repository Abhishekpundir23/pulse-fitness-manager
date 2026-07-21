import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMemberSnapshotQuery } from '../lib/member-query.ts';

test('selects the latest membership that existed by the snapshot date', () => {
  const query = buildMemberSnapshotQuery({
    search: 'Asha',
    filter: 'all',
    snapshotDate: '2026-06-30',
    attendanceDate: '2026-07-21',
  });
  assert.match(query.sql, /ms\.start_date <= \?/);
  assert.match(query.sql, /ORDER BY ms\.start_date DESC, ms\.id DESC/);
  assert.deepEqual(query.args.slice(0, 2), ['2026-06-30', '2026-06-30']);
  assert.equal(query.args.at(-1), '%Asha%');
});

test('active and expired filters compare membership dates to the snapshot', () => {
  assert.match(buildMemberSnapshotQuery({ search: '', filter: 'active', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql, /ms\.end_date >= \?/);
  assert.match(buildMemberSnapshotQuery({ search: '', filter: 'expired', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql, /ms\.end_date < \?/);
});

test('binds active-filter placeholders in complete SQL order', () => {
  const query = buildMemberSnapshotQuery({
    search: 'Asha',
    filter: 'active',
    snapshotDate: '2026-06-30',
    attendanceDate: '2026-07-21',
  });
  assert.deepEqual(query.args, [
    '2026-06-30',
    '2026-06-30',
    '2026-06-30',
    '2026-07-21',
    '%Asha%',
    '%Asha%',
    '%Asha%',
    '2026-06-30',
  ]);
});

test('pending excludes cancelled memberships and paid accepts a zero balance', () => {
  const due = buildMemberSnapshotQuery({ search: '', filter: 'due', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql;
  const paid = buildMemberSnapshotQuery({ search: '', filter: 'paid', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql;
  assert.match(due, /ms\.status != 'cancelled'/);
  assert.match(due, /total_amount.*paid_amount/);
  assert.match(paid, /= 0/);
});

test('cancelled filter only returns cancelled snapshot memberships', () => {
  assert.match(buildMemberSnapshotQuery({ search: '', filter: 'cancelled', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql, /ms\.status = 'cancelled'/);
});
