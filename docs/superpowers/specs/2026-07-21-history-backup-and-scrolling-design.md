# Pulse Fitness Manager 1.2.0 Design

## Goal

Release Pulse Fitness Manager 1.2.0 as an in-place Android update that fixes scrolling and backup reliability, adds complete payment history, and lets the gym inspect current or historical member cohorts without losing existing local data.

## Upgrade Compatibility

- Keep Android package ID `in.parsewave.pulsefitness`.
- Keep the existing Expo project and EAS Android signing identity.
- Set app version to `1.2.0` and Android `versionCode` to `8`.
- Use additive SQLite migrations only. Installing the APK over version 1.1.3 must preserve members, memberships, payments, attendance, expenses, profile photos, plans, and gym settings.
- Never require uninstalling the current app. The final release instructions will explicitly say to install the APK over the existing installation.

## Member Directory

The Members tab will use one root `FlatList` rather than a fixed header followed by a smaller nested list area. Its header will contain the title, search field, status filters, and historical period controls; the entire page will scroll naturally while the floating Add Member action remains reachable above the tab bar.

Filters will be `All`, `Active`, `Pending`, `Paid`, `Expired`, and `Cancelled`. Payment and lifecycle filters may overlap by design: an expired membership can still have a pending balance, while `Cancelled` removes that membership from pending dues.

The default view represents the current date. Selecting a past month creates an end-of-month snapshot. For each member, the app selects the latest membership that started on or before the snapshot date, then calculates:

- `Active`: not cancelled and the membership end date is on or after the snapshot date.
- `Pending`: not cancelled and `total_amount - paid_amount > 0`.
- `Paid`: a membership exists and its remaining balance is zero.
- `Expired`: not cancelled and the membership end date is before the snapshot date.
- `Cancelled`: the selected membership status is cancelled.

Search applies after the selected snapshot and status filter. Member cards show the plan and dates from the selected historical membership rather than silently reverting to the current plan.

## Payment History

Reports will keep a short Recent Payments preview and add a `View all` action. That action opens a dedicated Payment History route backed by a root `FlatList`.

Payment History will provide:

- All recorded payments, not a hard-coded limit of 10.
- Search by member name, phone, or membership ID.
- `All time` and individual month selection, including previous years.
- Payment-method filters for All, Cash, UPI, Card, and Bank transfer.
- A visible total and transaction count for the current filters.
- Rows that open the related member profile.

Database queries will filter and sort before rendering so long histories remain responsive.

## Scrolling And Layout

The shared `Screen` scroll variant will explicitly fill its parent and use automatic content inset adjustment. Full-page collections will use `FlatList` directly instead of putting virtualized lists inside `ScrollView` or card-sized wrappers. Lists will include sufficient bottom padding for the tab bar and floating actions.

The Reports page will retain a single bounded root scroll container. The expense modal will gain its own scrollable form so small Android screens and open keyboards cannot hide controls.

## Backup And Restore

Backup creation will be separated from backup delivery:

1. Read all supported SQLite tables and available member photos.
2. Build a versioned JSON archive with metadata and record counts.
3. Write the archive to a local file and read it back immediately to verify valid JSON and matching metadata.
4. On Android, let the user choose a destination folder, including compatible Drive providers, and save the verified file there.
5. If direct folder saving is unavailable or cancelled, offer the native share sheet as a fallback without claiming that a backup was saved.

The Settings screen will show the last successfully completed backup time and filename. A success alert will include the filename and counts for members, payments, and attendance.

Restore will validate the app marker, schema version, required tables, row shapes, and foreign-key references before deleting anything. Database replacement will happen in one transaction. Photo restoration will happen after the database commit and will tolerate individual missing or invalid photos without discarding otherwise valid restored records. A cancelled picker will be reported as cancellation, not failure.

## Adjacent Corrections

- Pending-dues calculations will consistently exclude cancelled memberships.
- Expiry classification will use dates, because existing membership rows are not automatically rewritten to `expired` every day.
- Historical list queries will not mutate stored membership status.
- Loading, empty, and error states will explain the active filters.
- Routes from Dashboard pending dues, Reports recent payments, payment rows, and member cards will be checked for correct navigation.
- Existing duplicate-phone prevention and plan-change behavior from 1.1.3 will remain intact.

## Error Handling

Database and file failures will surface actionable messages. Backup code will distinguish creation, destination selection, sharing, validation, and restore failures. UI busy states will always clear in `finally` blocks. A failed restore transaction will leave the existing database unchanged.

## Testing And Verification

Focused automated tests will be added before implementation for:

- Historical snapshot date calculation.
- Active, pending, paid, expired, and cancelled classification.
- Payment month and payment-method filtering inputs.
- Backup archive validation and record summaries.
- Rejection of malformed or incompatible backups before destructive work.

Release verification will run TypeScript, lint, tests, Expo web export, rendered mobile-width checks where the runtime permits, and an EAS preview APK build. The final APK will be checked for version `1.2.0`, versionCode `8`, package ID `in.parsewave.pulsefitness`, file size, and SHA-256 hash.

## Out Of Scope

- Automatic background upload requiring a Google account or cloud backend.
- Multi-device live synchronization.
- Editing historical payment records.
- Changing the Android package ID or signing key.
