import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Chips } from '@/components/chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { RANGE_LABELS, type RangeKey } from '@/lib/dates';
import { buildQuestions, DIRECTION_LABELS, startSession, type DirectionChoice, type QuizMode } from '@/lib/quiz';
import { fetchWords, type Word } from '@/lib/words';

const COUNTS = [5, 10, 20, 0] as const; // 0 = all

export default function QuizSetupScreen() {
  const { user } = useAuth();
  const [range, setRange] = useState<RangeKey>('today');
  const [direction, setDirection] = useState<DirectionChoice>('en-pl');
  const [mode, setMode] = useState<QuizMode>('text');
  const [count, setCount] = useState<number>(10);
  const [loaded, setLoaded] = useState<{ range: RangeKey; words: Word[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Words for a previously selected range are stale while the new range loads.
  const words = loaded?.range === range ? loaded.words : null;

  useEffect(() => {
    if (!user) return;
    fetchWords(user.uid, range)
      .then((result) => setLoaded({ range, words: result }))
      .catch((e) => setError(e.message));
  }, [user, range]);

  function start() {
    if (!words?.length) return;
    const questions = buildQuestions(words, direction, count || words.length);
    startSession({ mode, questions, results: [] });
    router.replace(mode === 'text' ? '/quiz/text' : '/quiz/voice');
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Chips
          label="Które słówka"
          value={range}
          onChange={setRange}
          options={(Object.keys(RANGE_LABELS) as RangeKey[]).map((value) => ({ value, label: RANGE_LABELS[value] }))}
        />
        <Chips
          label="Rodzaj pytań"
          value={direction}
          onChange={setDirection}
          options={(Object.keys(DIRECTION_LABELS) as DirectionChoice[]).map((value) => ({
            value,
            label: DIRECTION_LABELS[value],
          }))}
        />
        <Chips
          label="Tryb"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'text', label: '⌨️ Pisemny' },
            { value: 'voice', label: '🎤 Głosowy' },
          ]}
        />
        <Chips
          label="Liczba pytań"
          value={count}
          onChange={setCount}
          options={COUNTS.map((value) => ({ value, label: value ? String(value) : 'Wszystkie' }))}
        />
        <ThemedText themeColor="textSecondary">
          {words === null ? 'Ładowanie…' : `Słówek w wybranym zakresie: ${words.length}`}
        </ThemedText>
        {error && <ThemedText themeColor="danger">{error}</ThemedText>}
        <Button title="Start" onPress={start} disabled={!words?.length} />
      </ScrollView>
    </ThemedView>
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
});
