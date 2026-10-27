import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider } from '@/lib/settings';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, initializing } = useAuth();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync();
  }, [initializing]);

  if (initializing) return null;

  return (
    <Stack>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="index" options={{ title: 'Moje słówka' }} />
        <Stack.Screen name="add" options={{ title: 'Dodaj słówko', presentation: 'modal' }} />
        <Stack.Screen name="quiz/setup" options={{ title: 'Quiz' }} />
        <Stack.Screen name="quiz/text" options={{ title: 'Quiz pisemny' }} />
        <Stack.Screen name="quiz/voice" options={{ title: 'Quiz głosowy' }} />
        <Stack.Screen name="quiz/summary" options={{ title: 'Podsumowanie', headerBackVisible: false }} />
        <Stack.Screen name="settings" options={{ title: 'Ustawienia' }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <SettingsProvider>
          <RootNavigator />
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
