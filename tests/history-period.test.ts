import assert from 'node:assert/strict';
import test from 'node:test';

import {
  currentMonthKey,
  formatMonthLabel,
  monthRange,
  shiftMonth,
  snapshotDateForMonth,
} from '../lib/history-period.ts';

test('uses today as the current-month snapshot', () => {
  assert.equal(currentMonthKey('2026-07-21'), '2026-07');
  assert.equal(snapshotDateForMonth('2026-07', '2026-07-21'), '2026-07-21');
});

test('uses the final calendar day for a past-month snapshot', () => {
  assert.equal(snapshotDateForMonth('2026-06', '2026-07-21'), '2026-06-30');
  assert.equal(snapshotDateForMonth('2024-02', '2026-07-21'), '2024-02-29');
});

test('never creates a future snapshot', () => {
  assert.equal(snapshotDateForMonth('2026-08', '2026-07-21'), '2026-07-21');
});

test('moves across year boundaries and returns an inclusive month range', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
});

test('formats month labels for the Indian locale', () => {
  assert.equal(formatMonthLabel('2026-07'), 'July 2026');
});
