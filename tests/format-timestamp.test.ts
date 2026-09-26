import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDate } from '../lib/format.ts';

test('backup timestamps display a calendar date in the viewing time zone', () => {
  assert.equal(formatDate('2026-09-26T20:00:00.000Z', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }), '27 September 2026');
  assert.equal(formatDate('2026-09-26T12:34:56.789Z', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }), '26 September 2026');
});

test('date-only records and missing dates keep their established meaning', () => {
  assert.equal(formatDate('2026-09-26', { day: 'numeric', month: 'long', year: 'numeric' }), '26 September 2026');
  assert.equal(formatDate(undefined), 'Not set');
});
