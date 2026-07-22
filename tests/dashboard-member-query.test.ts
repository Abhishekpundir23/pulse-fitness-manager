import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../lib/database.ts', import.meta.url)), 'utf8');

test('dashboard member rows include current snapshot fields required by MemberCard', () => {
  const query = source.slice(source.indexOf('const MEMBER_LIST_QUERY'), source.indexOf('export async function migrateDbIfNeeded'));
  assert.match(query, /END AS snapshot_status/);
  assert.match(query, /AS snapshot_date/);
});
