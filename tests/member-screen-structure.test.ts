import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

test('member directory uses one page-root FlatList with a list header', () => {
  const source = readFileSync(fileURLToPath(new URL('../app/(tabs)/members.tsx', import.meta.url)), 'utf8');
  assert.match(source, /ListHeaderComponent/);
  assert.doesNotMatch(source, /styles\.listArea/);
  assert.match(source, /contentInsetAdjustmentBehavior="automatic"/);
});
