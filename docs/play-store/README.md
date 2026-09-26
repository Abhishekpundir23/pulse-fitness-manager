# Pulse Fitness Manager 1.4 — Play submission pack

Publisher: **Abhishek Pundir** · Public support: **abhiyo13@gmail.com**

Prepared on 26 September 2026 for version **1.4.0**, Android version code **11**, package **in.parsewave.pulsefitness**. These materials have not been submitted to Google Play. Signed release artifacts and native verification are complete as described in `release-record.json` and `VALIDATION.md`. Google Play has not reviewed the bundle.

## Files to use

- `store-listing.json`: title, short description, full description and contact details.
- `store-description.txt`: the full description alone, ready to paste.
- `privacy.html`: standalone policy generated from the same `lib/privacy.ts` content shown inside the app. It works without scripts, remote fonts or external resources.
- `data-safety-draft.md`: proposed answers and the evidence needed before submitting them.
- `submission-checklist.md`: signing, build, account and review steps with official sources.
- `asset-brief.md`: exact asset specifications and screenshot captions.
- `release-record.json`: final source revision, EAS build IDs, signed artifact hashes and verification results.

The matching delivery copies are in the task’s `outputs/play-store-1.4/` folder. The APK and AAB are supplied separately beside the delivery folder. The delivery pack includes `play-icon-512.png`, `feature-graphic-1024x500.png`, seven actual app images in `screenshots/`, and their verification records. All screenshot records are fictional.

## Use this pack

1. Use the exact verified files and hashes in `release-record.json`. Review `VALIDATION.md` (or `../releases/1.4-validation.md` in the repository), including its retained RELRO diagnostic warnings and device-test limits. Remaining Play/account steps are unchecked in `submission-checklist.md`.
2. Host `privacy.html` at a stable public HTTPS address. Check that it opens without login, geographic restrictions or a download prompt. The local file is ready to host; no public policy URL has been created by this task.
3. Add the listing copy, confirmed support email, hosted privacy URL and actual 1.4 screenshots to Play Console. Review the Data Safety draft against the final artifact before answering the form.
4. Enroll with the **existing app signing key** before first upload. Upload the verified AAB to an internal test or draft release. Follow any account-specific closed-testing requirement before applying for production access.

The installable APK is for direct testing and updating existing users. The AAB is for Play Console; it is not a file the gym owner can tap to install. A successful build, an uploaded bundle, an internal test and a public production approval are separate states.

## Preserve the friend’s existing records

Keep the package name and signing certificate unchanged. Install the new APK over the existing app; **do not uninstall or clear storage**. A normal update does not need a restore. If Android rejects the update, retain the installed app and investigate the package, signature and version code.

## Refresh the generated policy and delivery copies

From the repository root:

```sh
node --import tsx docs/play-store/sync-materials.mjs
```

The script checks listing character limits, generates the policy directly from `lib/privacy.ts`, and copies only this pack’s named text files to `outputs/play-store-1.4/`. It does not publish anything or overwrite store image files. If the app’s data behavior changes, update its canonical policy and Data Safety analysis before regenerating this pack.
