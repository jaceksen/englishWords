import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { createSession, startSession } from '@/lib/quiz';
import { useQuizOptions } from '@/lib/quiz-options';
import { useSettings } from '@/lib/settings';
import { fetchWords, type Word } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-quiz-setup.jpg');
const START_BUTTON = require('@/assets/images/start-button.png');

/** One big start button; the quiz settings live behind the gear in the header. */
export default function QuizSetupScreen() {
  const { user } = useAuth();
  const { languageCode, language, uiLanguageCode, t, plan } = useSettings();
  const { range: savedRange, direction, mode, count, rounds } = useQuizOptions();
  // A saved "marked" range falls back to today's words once the plan no longer includes it.
  const range = savedRange === 'marked' && !plan.markWords ? 'today' : savedRange;
  const [loaded, setLoaded] = useState<{ key: string; words: Word[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Words for a previously selected range or language are stale while the new ones load.
  const key = `${languageCode}:${range}`;
  const words = loaded?.key === key ? loaded.words : null;

  useEffect(() => {
    if (!user) return;
    fetchWords(user.uid, languageCode, range)
      .then((result) => setLoaded({ key: `${languageCode}:${range}`, words: result }))
      .catch((e) => setError(e.message));
  }, [user, languageCode, range]);

  function start() {
    if (!words?.length) return;
    startSession(
      createSession({ mode, uiLang: uiLanguageCode, direction, count: count || words.length, rounds, pool: words }),
    );
    router.replace(mode === 'text' ? '/quiz/text' : '/quiz/voice');
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            // Labelled, so it is not mistaken for the app settings gear on the word list.
            <Pressable
              onPress={() => router.push('/quiz/options')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t.titles.quizOptions}
              style={styles.headerButton}>
              <ThemedText style={styles.headerIcon}>⚙️</ThemedText>
              <ThemedText type="smallBold">{t.titles.quizOptions}</ThemedText>
            </Pressable>
          ),
        }}
      />
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.setup.start}
          accessibilityState={{ disabled: !words?.length }}
          disabled={!words?.length}
          onPress={start}
          style={({ pressed }) => ({
            opacity: words?.length ? 1 : 0.4,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}>
          <Image source={START_BUTTON} style={styles.startImage} />
        </Pressable>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {words === null ? t.common.loading : `${language.flag} ${t.setup.wordsInRange(words.length)}`}
        </ThemedText>
        {error && (
          <ThemedText themeColor="danger" style={styles.center}>
            {error}
          </ThemedText>
        )}
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    gap: Spacing.four,
  },
  startImage: {
    width: 220,
    height: 220,
  },
  center: {
    textAlign: 'center',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  headerIcon: {
    fontSize: 22,
  },
});
