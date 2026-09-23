# Android backup release check

Run this on a test phone or emulator using synthetic gym records before distributing an update. Do not use the gym owner's only working copy as the restore test. Automated tests exercise the production backup service with real SQLite and disk files, but replace the Android pickers and content providers; this check covers those native boundaries.

## Previous version and update

1. Install the previously distributed signed APK. Add a custom plan, two members (one with a photo), a partial payment, attendance and an expense. Include a renewal with an old outstanding balance. Note the exact balances and dates.
2. Save a JSON backup to an accessible folder and keep another copy outside the phone. Confirm the file opens as JSON. Also share it to the destination normally used by the owner and verify that the attachment opens there.
3. Install the new APK over the old one, signed with the same key and using package `in.parsewave.pulsefitness`. **Do not uninstall the old app.** Check that the records, photos, plans and balances remain unchanged.

## Export and restore

4. Export to a selected folder. Expect “Folder backup verified” only after the saved contents have been checked. Cancel the folder picker once and confirm the recorded backup date does not change.
5. Share a backup. Wait until the receiving app actually saves/uploads it, then open or download the attachment and preview it in the gym app. Include a target that uploads in the background. Closing the picker alone is not a pass.
6. Change a member's name and record an additional payment in the test installation. Choose the earlier backup, inspect the gym/date/counts and cancel. Confirm that the edited records remain.
7. Select it again and confirm restoration. Verify every table's records, the earlier balances and the photo. Select “Restore previous data” and restore the recovery copy; verify that the later name and payment return too.
8. Restore the backup created by the previous app version. Confirm custom plans, membership periods, receipts, attendance, expenses and photos. New version-2 backups deliberately cannot be restored by older apps that do not understand payment reversals.
9. In a disposable copy of the JSON, change a membership's paid amount without changing its receipts. Restore must refuse the archive before any records change. Invalid/truncated JSON must also be refused.

If an older backup references a photo but contains no embedded photo bytes, the preview must identify that missing photo. Member and payment records remain restorable; a file path alone cannot recover an unavailable image. Individual photo-write failures after row restoration are reported separately; keep the source archive and recovery copy.

## Record the result

Record the device model, Android version, old/new APK versions and signing continuity, chosen folder provider, share destination, each step's result and any failure message. Native execution is still pending until those results are recorded. Compilation and automated test success are not a substitute for this check.
