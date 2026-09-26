import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { configureManifest, legacyRules, extractionRules } = require('../plugins/with-local-data.cjs');

test('local-storage release opts out of platform backup and keeps photography optional', () => {
  const input = { manifest: { application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' } }], 'uses-feature': [{ $: { 'android:name': 'android.hardware.camera', 'android:required': 'true' } }] } };
  const result = configureManifest(input);
  assert.equal(result.manifest.application[0].$['android:allowBackup'], 'false');
  assert.equal(result.manifest.application[0].$['android:fullBackupContent'], '@xml/pulse_backup_rules');
  assert.equal(result.manifest.application[0].$['android:dataExtractionRules'], '@xml/pulse_data_extraction_rules');
  configureManifest(result);
  for (const name of ['android.hardware.camera', 'android.hardware.camera.autofocus']) {
    const features = result.manifest['uses-feature'].filter((item: { $: Record<string, string> }) => item.$['android:name'] === name);
    assert.equal(features.length, 1);
    assert.equal(features[0].$['android:required'], 'false');
  }
});

test('manual backups remain the only configured data-transfer path on old and new Android', () => {
  const modernModes = [...extractionRules.matchAll(/<(cloud-backup|device-transfer)>([\s\S]*?)<\/\1>/g)];
  assert.equal(modernModes.length, 2);
  for (const xml of [legacyRules, ...modernModes.map((match) => match[2])]) {
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref']) {
      assert.ok(xml.includes(`<exclude domain="${domain}" path="." />`), domain);
    }
    assert.ok(!xml.includes('<include'));
  }
});
