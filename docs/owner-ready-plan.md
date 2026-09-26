# Owner-ready offline gym app implementation plan

**Goal:** Make the existing app usable by a gym owner on one phone, with owner-created plans, reliable dues and invoices, recoverable backups and safe member import.

**Architecture:** Retain Expo SDK 54 and local SQLite. Migrate existing records in place. Keep native file/sharing operations at the boundary and test financial and import behavior against real SQLite.

**Scope:** Owner-defined membership plans, billing corrections, safer backups, first-run setup and member import for one phone per gym. The September 26 follow-up also requests an installable update for the gym already using the app, with scrolling and backup fixes.

## Constraints

- Keep Android package `in.parsewave.pulsefitness` and existing gym records.
- New gyms start with no seeded plans; owners choose names, durations in months and prices. Existing plans are preserved.
- No server, account requirement, automatic WhatsApp sending or recurring API expense.
- Corrected payments retain the original entry, reversal reason and timestamp.
- Profile edits do not change purchased membership periods.
- A selected backup must be reviewed before replacement; a verified recovery copy must exist first.
- The initial implementation ended at a draft PR. The later user request authorizes a signed update APK and native validation. App-store publication and PR merge are outside this follow-up.

## Work and interfaces

- [x] Core records: migrate to v5, snapshot membership plan names, expose `MemberDetail.memberships` and `lifetime_due_amount`, settle older debts, reverse mistaken payments and reconcile filters/reports. Add SQLite lifecycle tests before fixes.
- [x] Member screens: select outstanding periods, show all membership balances, generate invoices from only one membership's valid payments, draft dues/renewal messages and expose reasoned reversals. Test invoice isolation, escaping and message encoding.
- [x] Backup: preview a selected archive, verify and retain a recovery copy, restore transactionally and expose recovery/export. Accept older archives and validate reversal-aware balances. Test failed recovery creation, failed restore and compatible round trips.
- [x] Setup and import: guide owner through profile and first plan; handle zero active plans; preview CSV with row errors and computed balances; import the entire valid batch transactionally. Test malformed CSV, duplicate phones, invalid dates/amounts, changed plans and rollback.
- [x] Integration: run lint/typecheck/all tests, export Android and web bundles, exercise rendered phone-sized flows, review the complete diff and prepare a reviewable branch/PR with exact user Git identity.

The core module owns `createMember(db, input, { inTransaction: true })` for import's enclosing transaction. Backup settings are a standalone component. UI consumers receive all payment rows for audit and filter voided entries when calculating totals.

## Review focus

1. Renewing a fully paid new period must not hide old debt.
2. Catalog or profile changes must not change an old bill or purchased dates.
3. A reversal must adjust the matching period exactly once and remain visible in history.
4. Import must revalidate current plans and phones at commit and leave no partial records on failure.
5. Restore must preserve a usable recovery copy across failure and avoid overwriting it during recovery.

## Validation record

Baseline: `npm run check` passed all 51 existing tests on main `8da5970` before changes. Concrete SQLite reproductions confirmed the three billing defects documented in the product review.

September 23 checkpoint (`b7623e7`): lint, TypeScript and 127 tests passed. Real SQLite regressions covered migration, financial lifecycles, phone identity, concurrent financial edits and import rollback. The backup follow-up included nine production-orchestration tests with real disk files and separate SQLite connections, four previous-version migration/restore tests, and three missing-photo regressions. These exercised full save/restore/undo, photo bytes, old dues after restoration, cancellation, disk-full recovery failure, changed recovery contents and SQL rollback. Sharing lifetime and incomplete-folder-file cleanup each failed their regression before correction. Browser checks at 390 × 844 verified owner-entered plans and preservation of unsaved gym details. Native Android execution had not yet been performed at that checkpoint.

September 26 update (`cf0187c`): lint, TypeScript and all **131 tests** pass. Two new backup regressions demonstrate that an empty or unreadable optional photo no longer blocks exporting the records; the source photo reference remains so its omission is disclosed. Two scrolling regressions cover the full expense list and Android navigation insets. Backup version 2 preserves payment-reversal metadata, and supported version-1 archives remain readable. Legacy membership plan names are captured from the current catalog during migration; names overwritten before migration cannot be recovered.

The signed **1.3.0/build 10 APK** was produced by [EAS build e32c1a9a-c2a7-4521-b78f-91b6a7fdaabf](https://expo.dev/accounts/abhi2302/projects/pulse-fitness-manager/builds/e32c1a9a-c2a7-4521-b78f-91b6a7fdaabf) from `cf0187c`. The package remains `in.parsewave.pulsefitness`. Both the old 1.2.1/build 9 APK and this update have signing-certificate SHA-256 `d7cf956bf2bbcc79eba2e595080c38111a9e56ddebee6d8c0bd92842a668da03`.

On an isolated Android test installation with synthetic records, installing build 10 over build 9 without uninstalling preserved every previous field across all seven tables and identical member-photo bytes; the database advanced from schema 4 to 5. Native scrolling reached all 36 expenses and the bottom tabs cleared three-button system navigation. A folder backup saved through Android's file picker was read back and matched all seven tables and embedded photo data. An independent share receiver waited five seconds before opening the shared URI and successfully read all 14,209 bytes.

The native [Android release check](backup-device-check.md) is the current record for these results, restore/recovery verification and any remaining checks. Automated tests with substituted native bridges remain useful for failure injection but do not replace native execution. These results concern the synthetic test installation; the gym owner's phone has not been altered. No app-store publication or PR merge is part of this update work.
