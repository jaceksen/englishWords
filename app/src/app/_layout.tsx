import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider, useT } from '@/lib/settings';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, initializing } = useAuth();
  const t = useT();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync();
  }, [initializing]);

  if (initializing) return null;

  return (
    <Stack>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="index" options={{ title: t.titles.words }} />
        <Stack.Screen name="add" options={{ title: t.titles.addWord, presentation: 'modal' }} />
        <Stack.Screen name="quiz/setup" options={{ title: t.titles.quiz }} />
        <Stack.Screen name="quiz/text" options={{ title: t.titles.textQuiz }} />
        <Stack.Screen name="quiz/voice" options={{ title: t.titles.voiceQuiz }} />
        <Stack.Screen name="quiz/summary" options={{ title: t.titles.summary, headerBackVisible: false }} />
        <Stack.Screen name="import/index" options={{ title: t.titles.import }} />
        <Stack.Screen name="import/text" options={{ title: t.titles.importText }} />
        <Stack.Screen name="import/review" options={{ title: t.titles.importReview }} />
        <Stack.Screen name="settings" options={{ title: t.titles.settings }} />
        <Stack.Screen name="billing" options={{ headerShown: false, animation: 'none' }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: t.titles.register }} />
        <Stack.Screen name="forgot-password" options={{ title: t.titles.forgotPassword }} />
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
