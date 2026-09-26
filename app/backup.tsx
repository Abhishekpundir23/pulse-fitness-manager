import { BackupSettings } from '@/components/backup-settings';
import { Screen, Section } from '@/components/ui-kit';
import { Text } from 'react-native';
import { palette } from '@/lib/theme';

export default function BackupScreen() {
  return <Screen>
    <BackupSettings />
    <Section title="Changing your phone?">
      <Text style={{ color: palette.inkSoft, fontSize: 14, lineHeight: 22 }}>Save a verified backup, keep a copy outside this phone, then install Pulse Fitness Manager on the new phone and choose that backup to restore. Review its gym name, date and record counts first.</Text>
      <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 21, marginTop: 12 }}>For an app update on this phone, install over the existing app. You do not need to restore a backup. Uninstalling or clearing storage removes the app’s local records and recovery copies.</Text>
    </Section>
  </Screen>;
}
