# Owner-ready offline gym app implementation plan

**Goal:** Make the existing app usable by a gym owner on one phone, with owner-created plans, reliable dues and invoices, recoverable backups and safe member import.

**Architecture:** Retain Expo SDK 54 and local SQLite. Migrate existing records in place. Keep native file/sharing operations at the boundary and test financial and import behavior against real SQLite.

**Scope:** Owner-defined membership plans, billing corrections, safer backups, first-run setup and member import for one phone per gym.

## Constraints

- Keep Android package `in.parsewave.pulsefitness` and existing gym records.
- New gyms start with no seeded plans; owners choose names, durations in months and prices. Existing plans are preserved.
- No server, account requirement, automatic WhatsApp sending or recurring API expense.
- Corrected payments retain the original entry, reversal reason and timestamp.
- Profile edits do not change purchased membership periods.
- A selected backup must be reviewed before replacement; a verified recovery copy must exist first.
- No production release or merge as part of implementation.

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

Baseline: `npm run check` passed all 51 existing tests on main `8da5970` before changes. Concrete SQLite reproductions confirmed the three billing defects documented in the product review. Final local check passes lint, TypeScript and all 111 tests. Real SQLite regressions cover migration, financial lifecycles, phone identity, concurrent financial edits and import rollback. Backup version 2 prevents older releases from silently dropping payment-reversal metadata; legacy version 1 remains readable. Browser checks at 390 × 844 verify owner-entered plans and preservation of unsaved gym details. Native picker, share sheet, photo restore and upgrade installation still require an Android device smoke test before release.
