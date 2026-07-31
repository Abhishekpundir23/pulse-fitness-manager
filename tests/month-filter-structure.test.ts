import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../components/month-filter.tsx'),
  'utf8',
);

test('month navigation keeps the next control available and labels future views', () => {
  assert.match(source, /onPress=\{\(\) => onChange\(shiftMonth\(selectedMonth, 1\)\)\}/);
  assert.doesNotMatch(source, /disabled=\{isCurrentMonth\}/);
  assert.match(source, /isFutureMonth.*Upcoming/s);
});
