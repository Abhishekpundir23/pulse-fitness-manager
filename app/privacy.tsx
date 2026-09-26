import { Alert, Linking, Text } from 'react-native';
import { PrimaryButton, Screen, Section, TopBar } from '@/components/ui-kit';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED, SUPPORT_EMAIL } from '@/lib/privacy';
import { palette } from '@/lib/theme';

export default function PrivacyScreen() {
  return <Screen>
    <TopBar title="Privacy & your data" subtitle={`Pulse Fitness Manager · Updated ${PRIVACY_UPDATED}`} />
    {PRIVACY_SECTIONS.map((item) => <Section key={item.title} title={item.title}><Text selectable style={{ fontSize: 14, lineHeight: 23, color: palette.inkSoft }}>{item.body}</Text></Section>)}
    <PrimaryButton label="Contact support" icon="mail-outline" variant="secondary" onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Pulse%20Fitness%20Manager%20privacy`).catch(() => Alert.alert('Contact support', `Email ${SUPPORT_EMAIL} from your email app.`)); }} />
  </Screen>;
}
