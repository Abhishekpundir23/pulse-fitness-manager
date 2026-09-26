import { Alert, Linking, Text } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { PrimaryButton, Screen, Section, TopBar } from '@/components/ui-kit';
import { DEVELOPER_NAME, SUPPORT_EMAIL } from '@/lib/privacy';
import { palette } from '@/lib/theme';

const GUIDES = [
  ['Start with your own plans', 'Save your gym details, create the plans you offer, then add members or import a CSV list. You choose plan names, durations in months and prices. Editing a plan affects future memberships; existing purchased amounts and dates stay intact.'],
  ['Collect an old due', 'Open Members → Dues, choose a member and record a payment against the outstanding membership period. A new renewal does not hide older dues. Cash, UPI, card and bank transfer are records of payments you collect separately.'],
  ['Correct a payment', 'Open the member’s payment history and reverse the incorrect entry with a reason. The original remains in the audit history. Record the correct payment separately. Reversing an entry does not send a refund.'],
  ['Keep attendance accurate', 'Use Attendance to check in members. Search narrows the list without changing the total for the selected day. Choose an earlier date to review or correct its entries. Future check-ins are not allowed.'],
  ['Save a backup', 'Open Gym → Backup & restore → Export backup → Save to folder. Choose Documents/PulseBackups (create it if needed), then Use this folder → Allow. Wait for Folder backup verified and keep a copy outside the phone. Android does not allow selecting the top-level storage folder.'],
  ['Change phones or recover data', 'Export a backup on the old phone and keep that file. On the new phone, choose the backup to restore and review its date and counts. A restore replaces current records after saving a recovery copy. Restore previous data can undo it. Local recovery copies are lost when the app is uninstalled.'],
  ['Update without losing records', 'Install an update over the existing app. Do not uninstall or clear storage to install it. A normal update does not need a restore. If installation fails, keep the existing app and contact support with the exact error.'],
] as const;
export default function HelpScreen() {
  return <Screen>
    <TopBar title="Here to help" subtitle="A simple routine for running your gym" />
    {GUIDES.map(([title, body]) => <Section key={title} title={title}><Text style={{ color: palette.inkSoft, fontSize: 14, lineHeight: 23 }}>{body}</Text></Section>)}
    <Section title="Contact support" subtitle={`${DEVELOPER_NAME} · Version ${Constants.expoConfig?.version ?? '1.4.0'}`}>
      <Text selectable style={{ color: palette.emeraldDark, fontSize: 16, marginBottom: 14 }}>{SUPPORT_EMAIL}</Text>
      <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 21, marginBottom: 16 }}>Include your app version and a description of the issue. Keep member details out of screenshots and do not attach your backup unless specifically needed.</Text>
      <PrimaryButton label="Write an email" icon="mail-outline" onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Pulse Fitness Manager support')}`).catch(() => Alert.alert('Email support', `Email ${SUPPORT_EMAIL} from your email app.`)); }} />
    </Section>
    <PrimaryButton label="Privacy & your data" variant="secondary" icon="lock-closed-outline" onPress={() => router.push('/privacy')} />
  </Screen>;
}
