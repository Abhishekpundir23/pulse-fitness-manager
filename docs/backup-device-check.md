# Android backup release check

Run this on a test phone or emulator using synthetic gym records before distributing an update. Do not use the gym owner's only working copy as the restore test. Automated tests exercise the production backup service with real SQLite and disk files, but replace the Android pickers and content providers; this check covers those native boundaries.

## Previous version and update

1. Install the previously distributed signed APK. Add a custom plan, two members (one with a photo), a partial payment, attendance and an expense. Include a renewal with an old outstanding balance. Note the exact balances and dates.
2. Save a JSON backup to an accessible folder and keep another copy outside the phone. Confirm the file opens as JSON. Also share it to the destination normally used by the owner and verify that the attachment opens there.
3. Install the new APK over the old one, signed with the same key and using package `in.parsewave.pulsefitness`. **Do not uninstall the old app.** Check that the records, photos, plans and balances remain unchanged.

## Export and restore

4. Export to **Documents/PulseBackups** (create the folder if needed), then select **Use this folder → Allow**. Android restricts the top-level internal-storage folder. Expect “Folder backup verified” only after the saved contents have been checked. Cancel the folder picker once and confirm the recorded backup date does not change.
5. Share a backup. Wait until the receiving app actually saves/uploads it, then open or download the attachment and preview it in the gym app. Include a target that uploads in the background. Closing the picker alone is not a pass.
6. Change a member's name and record an additional payment in the test installation. Choose the earlier backup, inspect the gym/date/counts and cancel. Confirm that the edited records remain.
7. Select it again and confirm restoration. Verify every table's records, the earlier balances and the photo. Select “Restore previous data” and restore the recovery copy; verify that the later name and payment return too.
8. Restore the backup created by the previous app version. Confirm custom plans, membership periods, receipts, attendance, expenses and photos. New version-2 backups deliberately cannot be restored by older apps that do not understand payment reversals.
9. In a disposable copy of the JSON, change a membership's paid amount without changing its receipts. Restore must refuse the archive before any records change. Invalid/truncated JSON must also be refused.

If an older backup references a photo but contains no embedded photo bytes, the preview must identify that missing photo. Member and payment records remain restorable; a file path alone cannot recover an unavailable image. Individual photo-write failures after row restoration are reported separately; keep the source archive and recovery copy.

## Record the result

Record the device model, Android version, old/new APK versions and signing continuity, chosen folder provider, share destination, each step's result and any failure message. Compilation and automated test success are not a substitute for this check.

## September 26, 2026 signed update validation

Test installation: isolated Android 15/API 35 Google APIs ARM64 emulator, 390 × 840 dp. Synthetic records only; the gym owner's phone was not accessed. Tests used the actual signed standalone APKs, without Expo Go or Metro.

- Old APK: **1.2.1/build 9**, source `8da59706a7a1ba479f9028e7b41d735f86df47d3`, EAS build `a139769e-e4c3-42d5-b5ad-58e840b35f37`. This was the latest EAS build before the current chat. Its expired Expo artifact was recovered from the matching GitHub release and its published checksum verified.
- New APK: **1.3.0/build 10**, source `cf0187ca2348ef9997430679a1479cd3463105c6`, [EAS build e32c1a9a](https://expo.dev/accounts/abhi2302/projects/pulse-fitness-manager/builds/e32c1a9a-c2a7-4521-b78f-91b6a7fdaabf).
- Package on both: `in.parsewave.pulsefitness`.
- Both APK signatures verified. Signing-certificate SHA-256 on both: `d7cf956bf2bbcc79eba2e595080c38111a9e56ddebee6d8c0bd92842a668da03`.
- Old APK SHA-256: `7ba03dc4f40c164de6cc9d4c62a963ae1d685340bec07ddc07fd983b6d6bf204`.
- New APK SHA-256: `c31dfb0b421e7de87f19449a87b8307f1d712bb3fce3f5d5f839d10320ff0c89`.

The fixture contained two custom plans, two members including one photo, three membership periods with an old outstanding balance, four payments, two attendance records and 36 expenses. It was loaded through the old app's native document picker and legacy backup restoration.

| Check | Observed result |
| --- | --- |
| Reproduce old expense problem | Old APK stopped after 10 of 36 stored expenses. Its tabs also overlapped Android three-button navigation. |
| Install update over old app | `adb install -r` succeeded without uninstalling. Every prior field in all seven database tables was unchanged, the photo bytes were identical, schema migrated from 4 to 5, and SQLite integrity/foreign-key checks passed. |
| Full expense list | Native swipes exposed every expense from 36 through 1; all 36 identifiers were checked in accessibility captures. |
| System navigation clearance | Three-button tabs and labels were fully above system navigation. Gesture navigation also rendered its tabs above the system gesture area. |
| Save to folder | Native Android DocumentsUI selected `Documents/PulseBackups` and granted access. “Folder backup verified” appeared. The external JSON matched every database table and the embedded photo bytes. |
| Delayed share receiver | Selected a separate test app through Android's share sheet. It waited five seconds before opening the FileProvider URI, read all 14,209 bytes and saved valid JSON with the original records and photo. The gym app correctly said it could not verify the destination and did not change the verified folder-backup date. |
| Restore preview cancellation | Changed and saved the gym name after exporting. The native document picker opened the original backup and displayed correct gym/counts. Cancelling left the SQLite file byte-for-byte unchanged. |
| Restore confirmed | The original backup restored every table and identical photo bytes. The photo path was newly generated as expected. The app created a verified recovery archive containing every field of the edited pre-restore database and photo. |
| Restore recovery / undo | Restoring that recovery copy returned the edited gym name and every other record, with identical photo bytes. Two recovery copies remained; the first file was unchanged. SQLite integrity and foreign-key checks passed. |

Source validation: lint, TypeScript and **131 tests** passed locally and in [GitHub Actions run 36243032089](https://github.com/Abhishekpundir23/pulse-fitness-manager/actions/runs/36243032089), including Android bundle export. Failure-injection tests cover cancelled file/folder pickers, incomplete writes, failed recovery creation, invalid archives, transaction rollback, empty/unreadable photos and legacy v1 compatibility. These injected failures were not all repeated through the native UI in this run.

Scope limits: this run verifies Android's local storage provider and an independent delayed share receiver. It does not verify upload completion in the owner's particular Drive/WhatsApp/email app or behavior on the owner's physical phone. Check that destination after sharing. Native restore used the new v2 folder archive; v1 compatibility in the new app is covered by the real-SQLite automated legacy tests.

Local evidence is retained in the task's `work/android-validation/` directory: APK signature reports, database snapshots, JSON archives, photo bytes, screen captures and accessibility dumps. Test data and generated backups are not committed to this repository.
