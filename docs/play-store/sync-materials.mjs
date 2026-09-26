import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEVELOPER_NAME, SUPPORT_EMAIL, PRIVACY_UPDATED, PRIVACY_SECTIONS } from '../../lib/privacy.ts';

const folder = path.dirname(fileURLToPath(import.meta.url));
const delivery = path.resolve(folder, '../../../../outputs/play-store-1.4');
const listing = JSON.parse(await readFile(path.join(folder, 'store-listing.json'), 'utf8'));
const limits = { title: 30, shortDescription: 80, fullDescription: 4000 };
for (const [field, limit] of Object.entries(limits)) {
  const count = [...listing[field]].length;
  if (count > limit) throw new Error(`${field}: ${count} characters exceeds ${limit}`);
  process.stdout.write(`${field}: ${count}/${limit} characters\n`);
}
if (listing.developerName !== DEVELOPER_NAME || listing.supportEmail !== SUPPORT_EMAIL) {
  throw new Error('Listing contact does not match the canonical in-app privacy information.');
}
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sections = PRIVACY_SECTIONS.map((item, index) => `    <section aria-labelledby="section-${index + 1}">\n      <h2 id="section-${index + 1}">${escape(item.title)}</h2>\n      <p>${escape(item.body)}</p>\n    </section>`).join('\n');
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Privacy policy for Pulse Fitness Manager: local gym records, optional photos, manual backups and sharing you control.">
  <meta name="color-scheme" content="light">
  <title>Privacy Policy — Pulse Fitness Manager</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #14212a; background: #f4f7f6; }
    * { box-sizing: border-box; }
    body { margin: 0; line-height: 1.7; }
    main { max-width: 780px; margin: 32px auto; padding: 38px; background: #fff; border: 1px solid #dbe5df; border-radius: 18px; }
    .eyebrow { color: #08765b; font-weight: 700; margin: 0 0 8px; }
    h1 { font-size: clamp(1.9rem, 5vw, 2.7rem); line-height: 1.2; margin: 0 0 16px; letter-spacing: -0.035em; }
    h2 { font-size: 1.2rem; line-height: 1.4; margin: 30px 0 8px; }
    p { margin: 8px 0 16px; }
    .meta { color: #4b6060; }
    a { color: #00634c; text-decoration-thickness: 2px; text-underline-offset: 3px; overflow-wrap: anywhere; }
    a:focus-visible { outline: 3px solid #00765a; outline-offset: 5px; border-radius: 2px; }
    .contact { padding: 15px 18px; background: #edf7f2; border-radius: 10px; }
    footer { border-top: 1px solid #dbe5df; margin-top: 32px; padding-top: 16px; color: #4b6060; }
    @media (max-width: 600px) { main { margin: 0; padding: 26px 20px; border: 0; border-radius: 0; } }
    @media print { :root { background: white; } main { max-width: none; margin: 0; padding: 0; border: 0; } }
  </style>
</head>
<body>
  <main id="main">
    <header>
      <p class="eyebrow">Pulse Fitness Manager</p>
      <h1>Privacy Policy</h1>
      <p class="meta">Updated ${escape(PRIVACY_UPDATED)} · Developed by ${escape(DEVELOPER_NAME)}</p>
      <p class="contact">Support and privacy contact: <a href="mailto:${escape(SUPPORT_EMAIL)}">${escape(SUPPORT_EMAIL)}</a></p>
    </header>
${sections}
    <footer><p>Pulse Fitness Manager · ${escape(DEVELOPER_NAME)}</p></footer>
  </main>
</body>
</html>
`;
await writeFile(path.join(folder, 'privacy.html'), html);
await writeFile(path.join(folder, 'store-description.txt'), `${listing.fullDescription}\n`);
await mkdir(delivery, { recursive: true });
for (const name of ['README.md', 'store-listing.json', 'store-description.txt', 'privacy.html', 'data-safety-draft.md', 'submission-checklist.md', 'asset-brief.md', 'release-record.json']) {
  await copyFile(path.join(folder, name), path.join(delivery, name));
}
await copyFile(path.join(folder, '../releases/1.4-validation.md'), path.join(delivery, 'VALIDATION.md'));
process.stdout.write(`Generated ${PRIVACY_SECTIONS.length} canonical privacy sections and copied submission text files to ${delivery}\n`);
