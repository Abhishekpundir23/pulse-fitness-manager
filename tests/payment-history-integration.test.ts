import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reportsSource = readFileSync(new URL('../app/(tabs)/reports.tsx', import.meta.url).pathname, 'utf8');
const paymentsSource = readFileSync(new URL('../app/payments.tsx', import.meta.url).pathname, 'utf8');

test('Reports View all opens payment history and preview rows open their member', () => {
  assert.match(reportsSource, /onPress=\{\(\) => router\.push\('\/payments'\)\}/);
  assert.match(reportsSource, /onPress=\{\(\) => router\.push\(`\/member\/\$\{payment\.member_id\}`\)\}/);
});

test('payment history rows open their member', () => {
  assert.match(paymentsSource, /onPress=\{\(\) => router\.push\(`\/member\/\$\{item\.member_id\}`\)\}/);
});

test('payment history exposes all-time month filtering and method filter state', () => {
  assert.match(paymentsSource, /const \[method, setMethod\] = useState<PaymentHistoryMethod>\('all'\)/);
  assert.match(paymentsSource, /<MonthFilter value=\{month\} onChange=\{setMonth\} allowAllTime \/>/);
  assert.match(paymentsSource, /onPress=\{\(\) => setMethod\(item\)\}/);
});
