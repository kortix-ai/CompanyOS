import { Stack } from 'expo-router';

import { PlanPage } from '@/components/settings/PlanPage';

/**
 * Plans screen (components/settings/PlanPage). Checkout happens on
 * kortix.com; the app has no in-app purchase.
 */
export default function PlansScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PlanPage />
    </>
  );
}
