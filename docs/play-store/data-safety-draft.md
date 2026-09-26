# Data Safety draft — Pulse Fitness Manager 1.4

Prepared 26 September 2026. Publisher: Abhishek Pundir. Contact: abhiyo13@gmail.com.

This is a review worksheet, not a submitted declaration. The final AAB from source `4b9ece3` has been inspected for manifest permissions, packaged backup exclusions, signing and native packaging. Its generated APK passed offline device workflows. Source/dependency review found no automatic telemetry or backend integration; these checks are not a comprehensive network-capture audit of every native code path. Revisit this worksheet before adding analytics, cloud services, crash reporting, advertisements or a payment gateway.

## Proposed form position

**Candidate answer to data collection/sharing: No**, provided the final artifact confirms the behavior below and every user-chosen transfer meets Google’s stated exception. Local storage alone is not sufficient evidence for this answer.

Google excludes data that is accessed and processed only on the device from “collected.” Its definition of sharing includes transfers to another app, but exempts specific user-initiated transfers when the user reasonably expects the sharing. Review these definitions while completing the live form. [Official Data Safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469)

## What the reviewed source does

| Data or action | Behavior in this version | Declaration reasoning to confirm |
| --- | --- | --- |
| Gym and member profiles | Names, contact details, optional date of birth/address/gender/notes, member IDs and photos remain in private app files and SQLite. | On-device processing; not automatically sent to the developer. |
| Memberships, payments and expenses | Local business records, including payment amount/method/date and reversals. No card credentials or payment transaction processing. | Local financial records still need privacy disclosure, even when not “collected” under the form’s definition. |
| Attendance | Local check-ins and editable past-day records. | No location collection or remote attendance service. |
| Member photos | Optional camera permission or system-selected image; stored locally. | Verify no broad photo-library, video or microphone permissions in the final artifact. |
| Backup, invoice and CSV template sharing | Only after the owner chooses export/share and a destination. A backup contains gym/member/financial records and available photos. | Candidate user-initiated sharing exception; keep the action and contents clear to the user. |
| WhatsApp reminder | The owner opens a prepared reminder in the selected app/service and reviews/sends it. A link contains the member number and reminder text. | Candidate user-initiated sharing exception; do not describe this as data never leaving the device. |
| Support email | Opens the external email app with support address/subject; no automatic database attachment. | Support messages and any attachments the owner separately sends are handled outside the app’s local database flow. |
| Android backup | App config and custom native rules disable automatic cloud and device-transfer backup. | Check the generated manifest and packaged XML rules before relying on this statement. |
| Diagnostics, ads and tracking | No analytics/ads/crash-reporting SDK or server API was found in the reviewed app code and direct dependencies. | Recheck the final dependency/artifact audit; INTERNET permission alone does not establish collection or its absence. |

Reviewed source: `lib/privacy.ts`, `lib/types.ts`, `lib/reminders.ts`, `lib/backup.ts`, `lib/database.ts`, `app/help.tsx`, `app/member/new.tsx`, `app/member/edit/[id].tsx`, `app/import-members.tsx`, `package.json`, `app.json` and `plugins/with-local-data.cjs`.

## Other answers and disclosures

- **Account creation:** none. There is no app account/login, so an account-deletion web flow is not applicable to this release. Local member deletion and Android clear-storage/uninstall behavior are explained in the policy. Externally saved backups must be deleted at their destination. Do not relabel ordinary member records as online app accounts. [Account-deletion policy](https://support.google.com/googleplay/android-developer/answer/10144311)
- **Ads:** no ads in the reviewed version.
- **Encryption:** do not claim encrypted backups or a separate encrypted database. Android app-private storage is used; exported JSON backups are not encrypted by Pulse. If the live form asks about data transmitted by the app, answer only for actual in-scope transmissions, not from assumptions about another app’s encryption.
- **Independent security review:** none claimed.
- **Privacy policy:** required even with a No collection/sharing answer. Host the supplied policy at a public HTTPS URL and retain the in-app policy. [Privacy policy requirements](https://support.google.com/googleplay/android-developer/answer/10144311)

## Before submitting

1. Review the final artifact evidence in `release-record.json` and `VALIDATION.md`. Recheck dependencies and any unexercised transfer/network behavior against the live form; offline functionality alone does not prove that every possible code path avoids transmission.
2. Exercise every export, WhatsApp and support action; confirm there is no automatic transmission and the selected content/destination are clear.
3. Review the live Play form and all track artifacts. If a final dependency or feature sends additional data, change the declaration and policy before submission.
4. Keep a copy of the exact answers submitted alongside the final artifact hashes. This file is not evidence that Play Console accepted the declaration.
