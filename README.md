# Pulse Fitness Manager

A modern, local-first Android app for managing gym members, membership plans, payments, dues, attendance, and business reports.

## Features

- Member profiles with editable contact details, notes, and membership IDs
- Camera or gallery profile photos that can be changed after saving
- Custom membership plan creation, editing, deactivation, and reactivation in Indian rupees
- Membership renewal and new-plan assignment for existing members
- Full, partial, and pending payment tracking
- Full-page payment history with member, month, and payment-method filters
- Historical member snapshots with Active, Paid, Pending, Expired, and Cancelled filters
- Membership cancellation that removes abandoned balances from dues
- Permanent member deletion with cascading cleanup
- Expense entry and removal with live monthly net calculation
- Cash, UPI, card, and bank-transfer payment records
- One-tap daily attendance
- Live collection, dues, expiry, and attendance dashboards
- Shareable PDF membership invoices
- Local SQLite storage with no required backend
- Verified JSON folder backups, Android file sharing and restore, including available profile photos
- Custom gym profile, branding, and Android launcher icon
- First-run setup with no preset membership plans or prices
- CSV member import with a complete preview, row validation and atomic saving
- Settlement of unpaid older membership periods after renewal
- Payment reversals with a reason, timestamp and retained original entry
- Editable WhatsApp dues and renewal drafts, sent manually by the owner
- Backup previews and verified local recovery copies before restoring

Editing or deactivating a plan in the catalog affects future memberships. Existing memberships retain their captured plan names, charges, payments and dates. When upgrading an older installation, plan names are captured from the catalog at that time; names overwritten before the upgrade cannot be reconstructed.

## First setup

1. Open **Gym** and save your gym name and contact details.
2. Add your own membership plans: name, duration in months and price in rupees. There are no fixed tiers or seeded prices. Existing installations retain their existing plans.
3. Add a member, or use **Import member list** to download a blank CSV template and preview a completed list.
4. Save a backup somewhere outside the app and keep a copy off the phone.

CSV import accepts up to 500 new members per file. Use the exact name of one active plan, a valid Indian mobile number, dates in `YYYY-MM-DD` format, and plain rupee amounts. Duplicate numbers and ambiguous plan names are rejected. `paid_amount` is recorded as a single opening payment on `start_date`; it does not reconstruct individual historical receipts. Use JSON backup/restore to transfer full history. Every row must pass validation, and a failed import leaves no partial members or payments.

## Dues, invoices and corrections

Member details show every membership period and the total outstanding balance. A payment can settle an older expired period even after the member renews. Each invoice contains only the selected period's charges and valid payments. Editing the member profile, including their profile joining date, does not change membership start or expiry dates.

To correct an erroneous payment, open its member record, choose **Reverse**, and enter a reason. The original record remains visible. Its amount is removed from collections and the matching period's paid balance; a second reversal is rejected. Reports and historical views are corrected by excluding reversed entries, including reports for the original payment month. Reversal records correct entry mistakes; they are not a cash-refund ledger. Record a replacement payment separately if needed.

WhatsApp reminders open an editable draft and then WhatsApp. The owner checks and sends the message; the app never sends automatically.

## Technology

- Expo SDK 54
- React Native and TypeScript
- Expo Router
- Expo SQLite
- EAS Build

## Run Locally

Requirements: Node.js and Expo Go on an Android device.

```bash
npm install
npx expo start
```

Scan the displayed QR code using Expo Go.

## Validation

Tests require Node.js 22.13 or newer (for `node:sqlite`) and the `sqlite3` command-line tool.

```bash
npm run check
npx expo-doctor
npx expo export --platform android
```

The 1.3.0 update passes lint, TypeScript and 131 tests. Native Android checks have also verified installation over 1.2.1 with existing data preserved, all 36 test expenses reachable by scrolling, folder-backup readback, and a shared file read five seconds after opening the receiver. See [the Android release check](docs/backup-device-check.md) for the current native validation record and any remaining checks.

## Android Build

To create an installable preview APK:

```bash
npx eas-cli build --platform android --profile preview
```

Version 1.3.0/build 10 was built from `cf0187c` in [EAS build e32c1a9a](https://expo.dev/accounts/abhi2302/projects/pulse-fitness-manager/builds/e32c1a9a-c2a7-4521-b78f-91b6a7fdaabf). Its package ID and signing certificate match the previously distributed 1.2.1/build 9 APK. This is an installable update APK; no app-store publication or PR merge is implied.

## Data and Backups

All operational data is stored locally in SQLite on one owner's phone. The **Gym** tab prepares and verifies a versioned JSON archive before it can be saved to a selected folder or handed to Android's share sheet. A share action does not claim that Google Drive saved the file; confirm the destination in the selected app. These archives contain member contact and financial information and are not encrypted by the app.

Restore first shows the selected gym, archive date and record counts. After confirmation, the app writes and verifies a local recovery copy before replacing records in a transaction. Verified recovery copies are retained after replacement or a later restore failure and can be previewed, shared or restored from Gym settings. An incomplete file left by a failed recovery write is marked unverified and cannot be restored. Restoring a verified recovery copy creates another copy without overwriting earlier copies. Missing, empty or unreadable source photos are omitted and disclosed before export and restore; photo-restoration failures are reported separately. A recovery copy on this phone does not protect against loss, uninstall or device failure: keep an external copy too. New exports and recovery copies use archive version 2 to preserve purchased plan names and payment reversals; older apps reject these files instead of losing reversal information. Supported version-1 JSON archives remain readable.

Folder saves are read back and compared with the complete archive before being recorded as successful; failed writes attempt to remove only the newly created incomplete file. Sharing uses a separate verified cache copy that stays available after the share picker closes, so delayed receiving apps can still read it. Only a folder save updates the recorded backup date. Closing the share picker does not prove that the destination saved the file; check the receiving app. See [the Android backup release check](docs/backup-device-check.md) for device verification.

For a folder backup, open **Gym → Backup & restore → Export backup → Save to folder**. In Android's file picker, open **Documents**, create or select **PulseBackups**, then choose **Use this folder** and **Allow**. Do not select the top-level internal-storage folder, which Android restricts. Wait for **Folder backup verified**, then keep a copy off the phone.

Install updates over the existing app without uninstalling it or clearing its storage. An update must retain package ID `in.parsewave.pulsefitness` and the same signing certificate and use a higher Android version code. Try to save a backup first. If the old backup function fails, keep the installed app and its data intact; install the verified update in place, check the records, then export a fresh backup. Restoring a backup is not required to update. If Android refuses installation, preserve the current installation and investigate the error instead of uninstalling it. An Android bundle export alone is not an installable APK or a device test.

Member data and generated backups are intentionally excluded from this repository.
