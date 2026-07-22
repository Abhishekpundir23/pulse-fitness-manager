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
- Verified JSON backup and restore through a selected device folder or Android share sheet, including profile photos
- Custom gym profile, branding, and Android launcher icon

Changing or deactivating a plan affects future memberships only. Existing membership invoices, payments, and balances retain the original agreed plan.

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

The migration integration test requires the `sqlite3` command-line tool.

```bash
npx tsc --noEmit
npm run lint
npx expo-doctor
npx expo export --platform android
```

## Android Build

To create an installable preview APK:

```bash
npx eas-cli build --platform android --profile preview
```

## Data and Backups

All operational data is stored locally in SQLite. The **Gym** tab prepares and verifies a versioned JSON archive before it can be saved to a selected folder or handed to Android's share sheet. A share action does not claim that Google Drive saved the file; confirm the destination in the selected app. Restore validates the complete archive before replacing local rows and isolates profile-photo failures.

Install version 1.2.0 over the existing app without uninstalling it. The Android package ID remains unchanged, so the local SQLite database is preserved during the update.

Member data and generated backups are intentionally excluded from this repository.
