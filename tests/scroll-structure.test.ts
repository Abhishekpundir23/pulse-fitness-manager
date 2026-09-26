import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

test('shared Screen scroll container fills the route and adjusts insets', () => {
  const source = readFileSync(fileURLToPath(new URL('../components/ui-kit.tsx', import.meta.url)), 'utf8');
  assert.match(source, /style=\{styles\.flex\}/);
  assert.match(source, /contentInsetAdjustmentBehavior="automatic"/);
});

test('reports expense modal contains a bounded ScrollView', () => {
  const source = readFileSync(fileURLToPath(new URL('../components/expense-editor.tsx', import.meta.url)), 'utf8');
  assert.match(source, /maxHeight: '100%'/);
  assert.match(source, /<ScrollView/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
});
