import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Chips } from '@/components/chips';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { RANGE_KEYS, type RangeKey } from '@/lib/dates';
import {
  createSession,
  directionLabel,
  ROUND_OPTIONS,
  startSession,
  type DirectionChoice,
  type QuizMode,
} from '@/lib/quiz';
import { useSettings } from '@/lib/settings';
import { fetchWords, type Word } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-quiz-setup.jpg');

const COUNTS = [5, 10, 20, 0] as const; // 0 = all

export default function QuizSetupScreen() {
  const { user } = useAuth();
  const { languageCode, language, uiLanguageCode, t } = useSettings();
  const [range, setRange] = useState<RangeKey>('today');
  const [direction, setDirection] = useState<DirectionChoice>('translate');
  const [mode, setMode] = useState<QuizMode>('voice');
  const [count, setCount] = useState<number>(10);
  const [rounds, setRounds] = useState<number>(1);
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
      <ScrollView contentContainerStyle={styles.content}>
        <Chips
          label={t.setup.range}
          value={range}
          onChange={setRange}
          options={RANGE_KEYS.map((value) => ({ value, label: t.ranges[value] }))}
        />
        <Chips
          label={t.setup.direction}
          value={direction}
          onChange={setDirection}
          options={(['translate', 'recall', 'cloze', 'mix'] as DirectionChoice[]).map((value) => ({
            value,
            label: directionLabel(value, language, uiLanguageCode, t),
          }))}
        />
        <Chips
          label={t.setup.mode}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'text', label: t.setup.modeText },
            { value: 'voice', label: t.setup.modeVoice },
          ]}
        />
        <Chips
          label={t.setup.count}
          value={count}
          onChange={setCount}
          options={COUNTS.map((value) => ({ value, label: value ? String(value) : t.setup.countAll }))}
        />
        <Chips
          label={t.setup.rounds}
          value={rounds}
          onChange={setRounds}
          options={ROUND_OPTIONS.map((value) => ({ value, label: value === 1 ? t.setup.noRepeat : `${value}×` }))}
        />
        {rounds > 1 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {t.setup.roundsHint}
          </ThemedText>
        )}
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {words === null ? t.common.loading : `${language.flag} ${t.setup.wordsInRange(words.length)}`}
        </ThemedText>
        {error && (
          <ThemedText themeColor="danger" style={styles.center}>
            {error}
          </ThemedText>
        )}
        <Button title={t.setup.start} onPress={start} disabled={!words?.length} />
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  center: {
    textAlign: 'center',
  },
});
