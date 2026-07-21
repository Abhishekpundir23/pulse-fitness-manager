import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('shared Screen scroll container fills the route and adjusts insets', () => {
  const source = readFileSync(new URL('../components/ui-kit.tsx', import.meta.url).pathname, 'utf8');
  assert.match(source, /style=\{styles\.flex\}/);
  assert.match(source, /contentInsetAdjustmentBehavior="automatic"/);
});

test('reports expense modal contains a bounded ScrollView', () => {
  const source = readFileSync(new URL('../app/(tabs)/reports.tsx', import.meta.url).pathname, 'utf8');
  assert.match(source, /modalScroll/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
});
