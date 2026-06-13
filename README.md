# Pulse Fitness Manager

A modern, local-first Android app for managing gym members, membership plans, payments, dues, attendance, and business reports.

## Features

- Member profiles with editable contact details, notes, and membership IDs
- Camera or gallery profile photos that can be changed after saving
- Custom membership plan creation, editing, deactivation, and reactivation in Indian rupees
- Membership renewal and new-plan assignment for existing members
- Full, partial, and pending payment tracking
- Membership cancellation that removes abandoned balances from dues
- Permanent member deletion with cascading cleanup
- Expense entry and removal with live monthly net calculation
- Cash, UPI, card, and bank-transfer payment records
- One-tap daily attendance
- Live collection, dues, expiry, and attendance dashboards
- Shareable PDF membership invoices
- Local SQLite storage with no required backend
- JSON backup and restore through Google Drive or device storage, including profile photos
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

All operational data is stored locally in SQLite. The **Gym** tab can export a versioned JSON archive through Android's share sheet. Selecting Google Drive stores the backup there. Restore validates the archive before replacing local records.

Member data and generated backups are intentionally excluded from this repository.
