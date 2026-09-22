import { router } from 'expo-router';

import { EmptyState, PrimaryButton, Section } from '@/components/ui-kit';

export function PlanRequired() {
  return (
    <Section>
      <EmptyState
        icon="barbell-outline"
        title="Create a membership plan first"
        message="Choose your own plan name, number of months and price in Your gym. You can also reactivate an existing plan."
        action={<PrimaryButton label="Set up my plans" icon="add" onPress={() => router.push('/settings')} />}
      />
    </Section>
  );
}
