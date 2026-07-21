# Pulse Fitness Manager 1.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-place Android update with reliable full-page lists, historical member cohorts, complete payment history, and verified backup/restore.

**Architecture:** Keep SQLite as the source of truth. Extract date/filter/query construction and archive validation into pure TypeScript modules covered by Node tests; Expo routes call thin database functions and render root `FlatList` or bounded `ScrollView` containers. Backup creation, validation, destination delivery, and restore are separate operations so failures cannot be mistaken for successful saves.

**Tech Stack:** Expo SDK 54, Expo Router 6, React Native 0.81, TypeScript 5.9, expo-sqlite, expo-file-system, expo-document-picker, expo-sharing, Node built-in test runner with `tsx`.

## Global Constraints

- Keep Android package ID `in.parsewave.pulsefitness` and the existing EAS signing identity.
- Release version is `1.2.0`; Android `versionCode` is `8`.
- Database migration is additive and preserves all version 1.1.3 data.
- Currency remains INR/rupees.
- Cancelled memberships never contribute to pending dues.
- Existing duplicate-phone, photo, join-date, delete, plan-management, and plan-change behavior remains intact.

---

### Task 1: Test Harness And Historical Period Rules

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/history-period.ts`
- Create: `tests/history-period.test.ts`

**Interfaces:**
- Produces: `currentMonthKey(today?)`, `shiftMonth(monthKey, delta)`, `snapshotDateForMonth(monthKey, today?)`, `monthRange(monthKey)`, and `formatMonthLabel(monthKey)`.
- Consumed by: member and payment filters in Tasks 2-4.

- [ ] **Step 1: Add the test runner dependency and script**

Run:

```bash
npm install --save-dev tsx
```

Add to `package.json` scripts:

```json
"test": "node --import tsx --test tests/**/*.test.ts"
```

- [ ] **Step 2: Write the failing historical period tests**

Create `tests/history-period.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
npm test
```

Expected: FAIL because `lib/history-period.ts` does not exist.

- [ ] **Step 4: Implement the minimal period helpers**

Create `lib/history-period.ts`:

```ts
function parseMonthKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error('Invalid month value.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('Invalid month value.');
  return { year, month };
}

export function currentMonthKey(today = new Date().toISOString().slice(0, 10)) {
  return today.slice(0, 7);
}

export function shiftMonth(monthKey: string, delta: number) {
  const { year, month } = parseMonthKey(monthKey);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

export function snapshotDateForMonth(monthKey: string, today = new Date().toISOString().slice(0, 10)) {
  const end = monthRange(monthKey).end;
  return end > today ? today : end;
}

export function formatMonthLabel(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run `npm test`; expected: 5 passing tests.

- [ ] **Step 6: Commit the task**

```bash
git add package.json package-lock.json lib/history-period.ts tests/history-period.test.ts
git commit -m "test: add historical period rules"
```

---

### Task 2: Historical Member Snapshot Query

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/member-query.ts`
- Create: `tests/member-query.test.ts`
- Modify: `lib/database.ts`

**Interfaces:**
- Produces: `MemberFilter = 'all' | 'active' | 'due' | 'paid' | 'expired' | 'cancelled'` and `buildMemberSnapshotQuery(input): { sql: string; args: (string | number)[] }`.
- Updates: `getMembers(db, search, filter, snapshotDate)`.

- [ ] **Step 1: Write failing query-construction tests**

Create `tests/member-query.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMemberSnapshotQuery } from '../lib/member-query.ts';

test('selects the latest membership that existed by the snapshot date', () => {
  const query = buildMemberSnapshotQuery({
    search: 'Asha',
    filter: 'all',
    snapshotDate: '2026-06-30',
    attendanceDate: '2026-07-21',
  });
  assert.match(query.sql, /ms\.start_date <= \?/);
  assert.match(query.sql, /ORDER BY ms\.start_date DESC, ms\.id DESC/);
  assert.deepEqual(query.args.slice(0, 2), ['2026-06-30', '2026-06-30']);
  assert.equal(query.args.at(-1), '%Asha%');
});

test('active and expired filters compare membership dates to the snapshot', () => {
  assert.match(buildMemberSnapshotQuery({ search: '', filter: 'active', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql, /ms\.end_date >= \?/);
  assert.match(buildMemberSnapshotQuery({ search: '', filter: 'expired', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql, /ms\.end_date < \?/);
});

test('pending excludes cancelled memberships and paid accepts a zero balance', () => {
  const due = buildMemberSnapshotQuery({ search: '', filter: 'due', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql;
  const paid = buildMemberSnapshotQuery({ search: '', filter: 'paid', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql;
  assert.match(due, /ms\.status != 'cancelled'/);
  assert.match(due, /total_amount.*paid_amount/);
  assert.match(paid, /= 0/);
});

test('cancelled filter only returns cancelled snapshot memberships', () => {
  assert.match(buildMemberSnapshotQuery({ search: '', filter: 'cancelled', snapshotDate: '2026-06-30', attendanceDate: '2026-07-21' }).sql, /ms\.status = 'cancelled'/);
});
```

- [ ] **Step 2: Run the query tests and verify RED**

Run `npm test`; expected: FAIL because `buildMemberSnapshotQuery` does not exist.

- [ ] **Step 3: Expand member types**

In `lib/types.ts`, replace `MemberFilter` and extend `MemberListItem`:

```ts
export type MemberFilter = 'all' | 'active' | 'due' | 'paid' | 'expired' | 'cancelled';
export type SnapshotStatus = 'none' | 'active' | 'expired' | 'cancelled';

// Add to MemberListItem:
snapshot_status: SnapshotStatus;
snapshot_date: string;
```

- [ ] **Step 4: Implement `buildMemberSnapshotQuery`**

Create `lib/member-query.ts`. The SELECT must return the existing `MemberListItem` columns plus `snapshot_status` and `snapshot_date`. Use this filter map:

```ts
import type { MemberFilter } from './types.ts';

type Input = { search: string; filter: MemberFilter; snapshotDate: string; attendanceDate: string };

function filterClause(filter: MemberFilter) {
  switch (filter) {
    case 'active': return "AND ms.id IS NOT NULL AND ms.status != 'cancelled' AND ms.end_date >= ?";
    case 'due': return "AND ms.id IS NOT NULL AND ms.status != 'cancelled' AND MAX(COALESCE(ms.total_amount, 0) - COALESCE(ms.paid_amount, 0), 0) > 0";
    case 'paid': return 'AND ms.id IS NOT NULL AND MAX(COALESCE(ms.total_amount, 0) - COALESCE(ms.paid_amount, 0), 0) = 0';
    case 'expired': return "AND ms.id IS NOT NULL AND ms.status != 'cancelled' AND ms.end_date < ?";
    case 'cancelled': return "AND ms.status = 'cancelled'";
    default: return '';
  }
}

export function buildMemberSnapshotQuery(input: Input) {
  const normalized = `%${input.search.trim()}%`;
  const filter = filterClause(input.filter);
  const dateFilterArgs = input.filter === 'active' || input.filter === 'expired' ? [input.snapshotDate] : [];
  const sql = `SELECT m.id, m.membership_id, m.name, m.gender, m.phone, m.photo_uri,
    m.status, m.joined_at, ms.plan_id, p.name AS plan_name, ms.status AS membership_status,
    ms.end_date, COALESCE(ms.total_amount, 0) AS total_amount,
    COALESCE(ms.paid_amount, 0) AS paid_amount,
    CASE WHEN ms.id IS NOT NULL AND ms.status != 'cancelled'
      THEN MAX(COALESCE(ms.total_amount, 0) - COALESCE(ms.paid_amount, 0), 0) ELSE 0 END AS due_amount,
    CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS attended_today,
    CASE WHEN ms.id IS NULL THEN 'none' WHEN ms.status = 'cancelled' THEN 'cancelled'
      WHEN ms.end_date < ? THEN 'expired' ELSE 'active' END AS snapshot_status,
    ? AS snapshot_date
    FROM members m
    LEFT JOIN memberships ms ON ms.id = (
      SELECT ms2.id FROM memberships ms2
      WHERE ms2.member_id = m.id AND ms2.start_date <= ?
      ORDER BY ms2.start_date DESC, ms2.id DESC LIMIT 1)
    LEFT JOIN plans p ON p.id = ms.plan_id
    LEFT JOIN attendance a ON a.member_id = m.id AND a.attendance_date = ?
    WHERE m.status != 'archived'
      AND (m.name LIKE ? OR m.phone LIKE ? OR m.membership_id LIKE ?)
      ${filter}
    ORDER BY m.created_at DESC`;
  return {
    sql,
    args: [input.snapshotDate, input.snapshotDate, input.snapshotDate, input.attendanceDate,
      normalized, normalized, normalized, ...dateFilterArgs],
  };
}
```

During implementation, keep placeholder order and `args` order identical; the test should also assert the complete order after this first GREEN pass.

- [ ] **Step 5: Route `getMembers` through the tested builder**

Replace the current function in `lib/database.ts`:

```ts
export async function getMembers(
  db: SQLiteDatabase,
  search = '',
  filter: MemberFilter = 'all',
  snapshotDate = todayIso(),
) {
  const query = buildMemberSnapshotQuery({ search, filter, snapshotDate, attendanceDate: todayIso() });
  return db.getAllAsync<MemberListItem>(query.sql, ...query.args);
}
```

Import `buildMemberSnapshotQuery` from `@/lib/member-query` and remove the obsolete `memberFilterSql` function.

- [ ] **Step 6: Verify GREEN and static checks**

Run:

```bash
npm test
npx tsc --noEmit
npm run lint
```

Expected: all pass.

- [ ] **Step 7: Commit the task**

```bash
git add lib/types.ts lib/member-query.ts lib/database.ts tests/member-query.test.ts
git commit -m "feat: query historical member snapshots"
```

---

### Task 3: Full-Page Member Directory And Period Control

**Files:**
- Create: `components/month-filter.tsx`
- Modify: `app/(tabs)/members.tsx`
- Modify: `components/member-card.tsx`

**Interfaces:**
- Consumes: Task 1 period helpers and Task 2 `getMembers` signature.
- Produces: reusable `<MonthFilter value onChange allowAllTime? />` and a root member `FlatList`.

- [ ] **Step 1: Add a failing static structure test**

Create `tests/member-screen-structure.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('member directory uses one page-root FlatList with a list header', () => {
  const source = readFileSync(new URL('../app/(tabs)/members.tsx', import.meta.url), 'utf8');
  assert.match(source, /ListHeaderComponent/);
  assert.doesNotMatch(source, /styles\.listArea/);
  assert.match(source, /contentInsetAdjustmentBehavior="automatic"/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run `npm test`; expected: FAIL because the current list is wrapped in `styles.listArea` and has no header component.

- [ ] **Step 3: Create the reusable month control**

Implement `components/month-filter.tsx` with:

```ts
type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  allowAllTime?: boolean;
};
```

Render previous/next arrow `Pressable` controls, the formatted month label, a `Current` reset action, and an optional `All time` chip. Disable next-month navigation at the current month. Use `shiftMonth`, `currentMonthKey`, and `formatMonthLabel` from Task 1.

- [ ] **Step 4: Replace the member screen with a root list**

In `app/(tabs)/members.tsx`:

- Add filters `All`, `Active`, `Pending`, `Paid`, `Expired`, `Cancelled`.
- Track `monthKey` initialized with `currentMonthKey()`.
- Calculate `snapshotDateForMonth(monthKey)` and pass it to `getMembers`.
- Render one `FlatList` directly inside `<Screen scroll={false} contentContainerStyle={styles.screen}>`.
- Move `TopBar`, `SearchBox`, `MonthFilter`, and filter chips into `ListHeaderComponent`.
- Use `ListEmptyComponent` for loading and empty states.
- Set `contentInsetAdjustmentBehavior="automatic"`, `keyboardShouldPersistTaps="handled"`, and bottom padding of at least `130`.
- Keep the Add Member button absolute above the tab bar.

- [ ] **Step 5: Make historical cards explicit**

In `components/member-card.tsx`, use `member.snapshot_status` and `member.snapshot_date` for the status copy. For a past snapshot, prefix the plan line with `As of {formatted snapshot date}`. Keep card navigation opening the current member profile.

- [ ] **Step 6: Verify GREEN and rendered behavior**

Run `npm test`, `npx tsc --noEmit`, and `npm run lint`. Start Expo web with `npx expo start --web --port 8081`; at a mobile-width viewport verify the whole Members page scrolls, filters remain reachable, and no inner scroll trap remains.

- [ ] **Step 7: Commit the task**

```bash
git add components/month-filter.tsx components/member-card.tsx 'app/(tabs)/members.tsx' tests/member-screen-structure.test.ts
git commit -m "feat: add full-page historical member directory"
```

---

### Task 4: Complete Payment History

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/payment-query.ts`
- Create: `tests/payment-query.test.ts`
- Modify: `lib/database.ts`
- Create: `app/payments.tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/(tabs)/reports.tsx`

**Interfaces:**
- Produces: `PaymentHistoryItem`, `PaymentHistoryFilters`, `PaymentHistoryResult`, `buildPaymentHistoryQuery(filters)`, and `getPaymentHistory(db, filters)`.

- [ ] **Step 1: Write failing payment query tests**

Create `tests/payment-query.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPaymentHistoryQuery } from '../lib/payment-query.ts';

test('all-time payment query has no date restriction or limit', () => {
  const query = buildPaymentHistoryQuery({ search: '', month: null, method: 'all' });
  assert.doesNotMatch(query.sql, /LIMIT 10/);
  assert.doesNotMatch(query.sql, /BETWEEN/);
});

test('payment query filters a selected month inclusively', () => {
  const query = buildPaymentHistoryQuery({ search: '', month: '2026-06', method: 'all' });
  assert.match(query.sql, /p\.paid_at BETWEEN \? AND \?/);
  assert.deepEqual(query.args.slice(-2), ['2026-06-01', '2026-06-30']);
});

test('payment query filters member identity and payment method', () => {
  const query = buildPaymentHistoryQuery({ search: 'PF-0042', month: null, method: 'UPI' });
  assert.match(query.sql, /m\.membership_id LIKE \?/);
  assert.match(query.sql, /p\.method = \?/);
  assert.ok(query.args.includes('%PF-0042%'));
  assert.ok(query.args.includes('UPI'));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run `npm test`; expected: FAIL because `lib/payment-query.ts` does not exist.

- [ ] **Step 3: Add payment history types and query builder**

Add to `lib/types.ts`:

```ts
export type PaymentHistoryMethod = 'all' | PaymentMethod;
export type PaymentHistoryFilters = { search: string; month: string | null; method: PaymentHistoryMethod };
export type PaymentHistoryItem = Payment & {
  member_name: string;
  member_phone: string;
  member_code: string;
};
export type PaymentHistoryResult = { items: PaymentHistoryItem[]; count: number; total: number };
```

Create `lib/payment-query.ts` using `monthRange()` to append optional SQL clauses and arguments. The final query must join `members`, order by `p.paid_at DESC, p.id DESC`, and contain no result limit.

- [ ] **Step 4: Add the database API**

In `lib/database.ts`:

```ts
export async function getPaymentHistory(
  db: SQLiteDatabase,
  filters: PaymentHistoryFilters,
): Promise<PaymentHistoryResult> {
  const query = buildPaymentHistoryQuery(filters);
  const items = await db.getAllAsync<PaymentHistoryItem>(query.sql, ...query.args);
  return { items, count: items.length, total: items.reduce((sum, item) => sum + item.amount, 0) };
}
```

- [ ] **Step 5: Build the full-page payment route**

Create `app/payments.tsx` with a root `FlatList`, `SearchBox`, `MonthFilter allowAllTime`, payment-method chips, a summary card showing filtered count and INR total, and rows that route to `/member/{member_id}`. Use `useFocusEffect`, app `revision`, a 180 ms search debounce, `contentInsetAdjustmentBehavior="automatic"`, and a filter-aware empty state.

Register it in `app/_layout.tsx`:

```tsx
<Stack.Screen name="payments" options={{ title: 'Payment history' }} />
```

- [ ] **Step 6: Link Reports to Payment History**

Change the Recent Payments `Section` action to:

```tsx
<Pressable onPress={() => router.push('/payments')}>
  <Text style={styles.textAction}>View all</Text>
</Pressable>
```

Make each preview row pressable and route it to the matching member.

- [ ] **Step 7: Verify GREEN**

Run tests, TypeScript, lint, and rendered mobile-width interaction: Reports -> View all -> select previous month -> choose UPI -> open member.

- [ ] **Step 8: Commit the task**

```bash
git add lib/types.ts lib/payment-query.ts lib/database.ts tests/payment-query.test.ts app/payments.tsx app/_layout.tsx 'app/(tabs)/reports.tsx'
git commit -m "feat: add complete payment history"
```

---

### Task 5: Shared Scrolling And Small-Screen Forms

**Files:**
- Modify: `components/ui-kit.tsx`
- Modify: `app/(tabs)/reports.tsx`
- Create: `tests/scroll-structure.test.ts`

**Interfaces:**
- Updates: `Screen` scroll behavior; no caller API changes.

- [ ] **Step 1: Write the failing structure test**

Create `tests/scroll-structure.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('shared Screen scroll container fills the route and adjusts insets', () => {
  const source = readFileSync(new URL('../components/ui-kit.tsx', import.meta.url), 'utf8');
  assert.match(source, /style=\{styles\.flex\}/);
  assert.match(source, /contentInsetAdjustmentBehavior="automatic"/);
});

test('reports expense modal contains a bounded ScrollView', () => {
  const source = readFileSync(new URL('../app/(tabs)/reports.tsx', import.meta.url), 'utf8');
  assert.match(source, /modalScroll/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `npm test`; expected: both tests fail against the current structure.

- [ ] **Step 3: Bound the shared scroll container**

Update the scrolling branch in `Screen`:

```tsx
<ScrollView
  style={styles.flex}
  contentInsetAdjustmentBehavior="automatic"
  showsVerticalScrollIndicator={false}
  contentContainerStyle={[styles.screenContent, contentContainerStyle]}
  keyboardShouldPersistTaps="handled">
  {children}
</ScrollView>
```

- [ ] **Step 4: Make the expense modal scroll safely**

Import `KeyboardAvoidingView`, `Platform`, and `ScrollView` in Reports. Wrap `modalCard` in a keyboard-avoiding container and place fields in a `ScrollView` with `style={styles.modalScroll}`, `keyboardShouldPersistTaps="handled"`, and bottom padding. Keep close controls and save button reachable on short displays.

- [ ] **Step 5: Verify GREEN and commit**

Run tests, TypeScript, and lint, then commit:

```bash
git add components/ui-kit.tsx 'app/(tabs)/reports.tsx' tests/scroll-structure.test.ts
git commit -m "fix: stabilize route and modal scrolling"
```

---

### Task 6: Validated Backup Archive And Safe Restore

**Files:**
- Create: `lib/backup-archive.ts`
- Create: `tests/backup-archive.test.ts`
- Modify: `lib/backup.ts`

**Interfaces:**
- Produces: `BackupArchive`, `BackupSummary`, `parseBackupArchive(serialized)`, `validateBackupArchive(value)`, `summarizeBackup(archive)`, `serializeBackup(archive)`.
- Updates: backup creation returns a verified local artifact; folder save and share are separate delivery functions.

- [ ] **Step 1: Write failing archive tests**

Create fixtures with one plan, member, membership, payment, and attendance. Test:

```ts
test('round-trips and summarizes a valid archive', () => {
  const parsed = parseBackupArchive(serializeBackup(validArchive));
  assert.deepEqual(summarizeBackup(parsed), { members: 1, payments: 1, attendance: 1 });
});

test('rejects missing required tables before restore', () => {
  const broken = structuredClone(validArchive) as any;
  delete broken.data.payments;
  assert.throws(() => validateBackupArchive(broken), /payments table/);
});

test('rejects orphaned membership references', () => {
  const broken = structuredClone(validArchive);
  broken.data.memberships[0].member_id = 999;
  assert.throws(() => validateBackupArchive(broken), /unknown member/);
});

test('accepts version 1 backups created by the current app', () => {
  assert.doesNotThrow(() => validateBackupArchive(validArchive));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run `npm test`; expected: FAIL because `backup-archive.ts` does not exist.

- [ ] **Step 3: Implement strict archive validation**

Move `BACKUP_TABLES`, `TABLE_COLUMNS`, and archive types from `lib/backup.ts` into `lib/backup-archive.ts`. Validation must:

- Check app marker and schema version 1.
- Require every table array.
- Require primary IDs and required string/number fields for plans, members, memberships, payments, attendance, and expenses.
- Build ID sets and reject orphaned membership, payment, and attendance references.
- Validate optional photo entries as `{ data: non-empty string, extension: safe alphanumeric string }`.
- Return the typed archive only after all checks pass.

- [ ] **Step 4: Separate creation, verification, and delivery**

Refactor `lib/backup.ts` to expose:

```ts
export type PreparedBackup = {
  file: File;
  archive: BackupArchive;
  filename: string;
  summary: BackupSummary;
};

export async function prepareBackup(db: SQLiteDatabase): Promise<PreparedBackup>;
export async function savePreparedBackup(prepared: PreparedBackup): Promise<string>;
export async function sharePreparedBackup(prepared: PreparedBackup): Promise<void>;
export async function restoreBackup(db: SQLiteDatabase): Promise<RestoreResult | null>;
```

`prepareBackup` must write the JSON cache file, read it back with `file.text()`, parse it with `parseBackupArchive`, and compare app marker/export timestamp/counts before returning.

`savePreparedBackup` must call `Directory.pickDirectoryAsync()`, create an `application/json` file with the exact backup filename, write the verified JSON, read it back, and parse it again before returning the destination URI.

`sharePreparedBackup` must call `Sharing.shareAsync` only after `Sharing.isAvailableAsync()` succeeds.

- [ ] **Step 5: Make restore transactional and photo-tolerant**

Parse and validate the complete archive before starting a transaction. Delete child tables before parent tables, insert parent tables before child tables, and leave foreign keys enabled. For member inserts, set `photo_uri` to null unless a matching embedded photo exists. Commit database rows first; restore each photo afterward with its own try/catch and return `{ exportedAt, summary, skippedPhotos }`.

- [ ] **Step 6: Verify GREEN and commit**

Run tests, TypeScript, and lint, then commit:

```bash
git add lib/backup-archive.ts lib/backup.ts tests/backup-archive.test.ts
git commit -m "fix: validate and verify local backups"
```

---

### Task 7: Backup User Flow, Status, And Additive Migration

**Files:**
- Modify: `lib/database.ts`
- Modify: `app/(tabs)/settings.tsx`

**Interfaces:**
- Produces: `getBackupStatus(db)` and `saveBackupStatus(db, timestamp, filename)`.
- Consumes: Task 6 prepared/save/share APIs.

- [ ] **Step 1: Add migration version 3**

Append an additive migration:

```ts
if (currentVersion < 3) {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_memberships_start_end ON memberships(member_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_payments_method_date ON payments(method, paid_at);
    INSERT OR IGNORE INTO settings(key, value) VALUES
      ('last_backup_at', ''),
      ('last_backup_file', '');
    PRAGMA user_version = 3;
  `);
}
```

- [ ] **Step 2: Add backup status helpers**

Implement settings-backed helpers that return `{ exportedAt: string; filename: string }` and upsert both values in one transaction.

- [ ] **Step 3: Replace the ambiguous export action**

In Settings, tapping Export creates a verified prepared backup, then shows choices:

- `Save to folder` -> `savePreparedBackup` -> save status -> success alert with filename and member/payment/attendance counts.
- `Share / Drive` -> `sharePreparedBackup` -> success alert that the share sheet completed, without claiming a Drive save.
- `Cancel` -> delete the temporary cache file when possible and clear busy state.

Show `Last successful backup: {date}` and filename in the Backup section. Restore success includes counts and any skipped photos.

- [ ] **Step 4: Verify migration and UI behavior**

Run tests, TypeScript, lint, and Expo web export. On Android/Expo Go verify save-to-folder, share, picker cancellation, valid restore, invalid JSON rejection, and that current data remains after a failed restore.

- [ ] **Step 5: Commit the task**

```bash
git add lib/database.ts 'app/(tabs)/settings.tsx'
git commit -m "feat: add verified backup workflow"
```

---

### Task 8: Adjacent Data Audit And Upgrade Release

**Files:**
- Modify: `lib/database.ts`
- Modify: `app.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

**Interfaces:**
- Produces: installable in-place Android APK version 1.2.0 / code 8.

- [ ] **Step 1: Correct pending-dues aggregations**

Audit Dashboard and Reports SQL. Every due sum must use:

```sql
CASE WHEN status != 'cancelled' THEN MAX(total_amount - paid_amount, 0) ELSE 0 END
```

Do not rewrite stored statuses based on dates; expiry remains a snapshot calculation.

- [ ] **Step 2: Bump release metadata**

Run:

```bash
npm version 1.2.0 --no-git-tag-version
```

Set `expo.version` to `1.2.0` and `expo.android.versionCode` to `8` in `app.json`. Confirm `expo.android.package` remains `in.parsewave.pulsefitness`.

- [ ] **Step 3: Run the complete verification suite**

```bash
npm test
npx tsc --noEmit
npm run lint
npx expo-doctor
npx expo export --platform web
git diff --check
```

Expected: all commands pass without app errors.

- [ ] **Step 4: Run rendered QA**

At a mobile viewport verify:

- Members page scrolls as one full page.
- Current and previous-month filters produce clear states.
- Pending, Paid, Expired, and Cancelled lists render.
- Reports scrolls to Recent Payments.
- View all opens Payment History and its filters work.
- Expense modal scrolls with the keyboard.
- Backup status copy and actions render without clipping.

- [ ] **Step 5: Commit the release code**

```bash
git add app components contexts lib tests package.json package-lock.json app.json README.md
git commit -m "release: Pulse Fitness Manager 1.2.0"
git tag v1.2.0
```

- [ ] **Step 6: Build the update APK**

```bash
npx eas-cli build --platform android --profile preview --non-interactive
```

Wait for `finished`, download the artifact as `Pulse-Fitness-Manager-v1.2.0.apk`, and record SHA-256 with:

```bash
shasum -a 256 Pulse-Fitness-Manager-v1.2.0.apk
```

- [ ] **Step 7: Verify upgrade metadata and publish**

Confirm EAS reports version 1.2.0 and versionCode 8. Push commits and tag to `Abhishekpundir23/pulse-fitness-manager`, create GitHub release `v1.2.0`, attach the APK, and state that users must install it over the current app without uninstalling so SQLite data remains preserved.
