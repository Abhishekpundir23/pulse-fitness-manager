import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../lib/database.ts', import.meta.url)), 'utf8');

test('dashboard and reports exclude only cancelled memberships from dues', () => {
  const dashboardFinance = source.slice(
    source.indexOf('const finance ='),
    source.indexOf('const present ='),
  );
  const reportSummary = source.slice(
    source.indexOf('const summary ='),
    source.indexOf('const month ='),
  );

  for (const query of [dashboardFinance, reportSummary]) {
    assert.match(query, /WHEN status != 'cancelled' THEN MAX\(total_amount - paid_amount, 0\)/);
  }
  assert.doesNotMatch(dashboardFinance, /WHERE status = 'active'/);
  assert.doesNotMatch(reportSummary, /WHEN status = 'active' THEN MAX\(total_amount - paid_amount, 0\)/);
});
