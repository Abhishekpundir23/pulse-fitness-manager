const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
const exclusions = domains.map((domain) => `    <exclude domain="${domain}" path="." />`).join('\n');
const legacyRules = `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${exclusions}\n</full-backup-content>\n`;
const extractionRules = `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`;

function configureManifest(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.$['android:allowBackup'] = 'false';
  application.$['android:fullBackupContent'] = '@xml/pulse_backup_rules';
  application.$['android:dataExtractionRules'] = '@xml/pulse_data_extraction_rules';
  const features = manifest.manifest['uses-feature'] ?? [];
  for (const name of ['android.hardware.camera', 'android.hardware.camera.autofocus']) {
    const feature = features.find((item) => item.$['android:name'] === name);
    if (feature) feature.$['android:required'] = 'false';
    else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
  }
  manifest.manifest['uses-feature'] = features;
  return manifest;
}

function withLocalData(config) {
  config = withAndroidManifest(config, (mod) => { mod.modResults = configureManifest(mod.modResults); return mod; });
  return withDangerousMod(config, ['android', async (mod) => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'pulse_backup_rules.xml'), legacyRules);
    await fs.writeFile(path.join(directory, 'pulse_data_extraction_rules.xml'), extractionRules);
    return mod;
  }]);
}
module.exports = withLocalData;
module.exports.configureManifest = configureManifest;
module.exports.legacyRules = legacyRules;
module.exports.extractionRules = extractionRules;
