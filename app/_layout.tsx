import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppDataProvider } from '@/contexts/app-data';
import { migrateDbIfNeeded } from '@/lib/database';
import { palette } from '@/lib/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: palette.canvas,
      card: palette.card,
      text: palette.ink,
      primary: palette.emeraldDark,
      border: palette.line,
    },
  };

  return (
    <SQLiteProvider databaseName="pulse-fitness.db" onInit={migrateDbIfNeeded}>
      <AppDataProvider>
        <ThemeProvider value={navigationTheme}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: palette.canvas },
              headerShadowVisible: false,
              headerTintColor: palette.ink,
              headerTitleStyle: { fontWeight: '800' },
              contentStyle: { backgroundColor: palette.canvas },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="member/new" options={{ title: 'Add member' }} />
            <Stack.Screen name="member/[id]" options={{ title: 'Member details' }} />
            <Stack.Screen name="member/edit/[id]" options={{ title: 'Edit member' }} />
            <Stack.Screen name="membership/[memberId]" options={{ title: 'New membership' }} />
            <Stack.Screen name="payment/[memberId]" options={{ title: 'Record payment' }} />
          </Stack>
          <StatusBar style="dark" />
        </ThemeProvider>
      </AppDataProvider>
    </SQLiteProvider>
  );
}
