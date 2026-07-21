import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('member directory uses one page-root FlatList with a list header', () => {
  const source = readFileSync(new URL('../app/(tabs)/members.tsx', import.meta.url).pathname, 'utf8');
  assert.match(source, /ListHeaderComponent/);
  assert.doesNotMatch(source, /styles\.listArea/);
  assert.match(source, /contentInsetAdjustmentBehavior="automatic"/);
});
