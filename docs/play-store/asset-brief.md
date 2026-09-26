# Store assets for Pulse Fitness Manager 1.4

Use the shipped app’s appearance and synthetic gym/member records. Avoid real member names, photos, phone numbers, balances or backups in public assets. The delivery pack supplies the icon, feature graphic and seven actual final-APK screenshots. `SCREENSHOTS.md` gives the captions for the images actually selected, and the two verification JSON files record their hashes and dimensions.

## Required file specifications

| Asset | Required format and dimensions | Check |
| --- | --- | --- |
| App icon | 512 × 512 px, 32-bit PNG with alpha, at most 1,024 KB | Export from the existing app brand; do not include price/rank badges. |
| Feature graphic | 1,024 × 500 px, JPEG or 24-bit PNG without alpha | Keep the main message and visuals away from crop edges. |
| Phone screenshots | At least two; JPEG or 24-bit PNG without alpha; each dimension 320–3,840 px; longer side no more than twice the shorter | Up to eight per supported device type. Capture a 1,080 × 1,920 test display for a simple valid portrait ratio. |

The delivered screenshots are 1,080 × 1,920 JPEGs, and the icon/feature graphic meet the dimensions and image modes above. In particular, **780 × 1,680 screenshots exceed the 2:1 maximum ratio** and should not be uploaded unchanged. Google distinguishes mandatory asset requirements from additional recommendations for promotional placement. [Official Play asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151)

## Suggested capture sequence and alt text

| Screen | Show | Suggested alt text |
| --- | --- | --- |
| Home | A synthetic gym with collection total, outstanding dues and quick actions | Gym dashboard showing monthly collections, outstanding dues and today’s check-ins. |
| Members | Member directory with meaningful synthetic names, filters and sort controls | Searchable member directory with membership filters and sorting. |
| Attendance | A date, present count and a few checked-in members | Attendance register with date selection, search and member check-in controls. |
| Reports | Monthly cash flow and collection chart | Monthly collections, expenses and net cash flow with a six-month chart. |
| Expense ledger | Enough expenses to show complete searchable records | Expense ledger with search, month filter and recorded gym costs. |
| Backup & restore | Verified manual backup controls with synthetic counts | Manual backup and restore controls for gym records stored on the phone. |

Only use an alt text after checking that the final image actually shows it. Suggested feature graphic message: **“Your gym’s daily records, in one place.”** Supporting words, if space permits: **“Members · Attendance · Dues · Expenses.”**

Do not add automatic collection, cloud sync, automatic reminders, encryption, free pricing, rankings, awards or a Play approval badge. Payment gateway integration is outside version 1.4. Keep asset filenames and checksums with the completed release record.
