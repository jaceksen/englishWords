import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { allRounds, createSession, getSession, startSession, type QuizResult } from '@/lib/quiz';
import type { Word } from '@/lib/words';

type Difficult = { word: Word; misses: number; last: QuizResult };

/** Words answered wrong at least once in any round, most missed first. */
function difficultWords(rounds: QuizResult[][]) {
  const byWord = new Map<string, Difficult>();
  for (const result of rounds.flat()) {
    if (result.grade.correct) continue;
    const entry = byWord.get(result.question.word.id);
    byWord.set(result.question.word.id, {
      word: result.question.word,
      misses: (entry?.misses ?? 0) + 1,
      last: result,
    });
  }
  return [...byWord.values()].sort((a, b) => b.misses - a.misses);
}

export default function SummaryScreen() {
  const session = getSession();
  const rounds = session ? allRounds(session) : [];
  const results = rounds.flat();
  const correct = results.filter((r) => r.grade.correct).length;
  const difficult = difficultWords(rounds);

  function retryDifficult() {
    if (!session) return;
    const pool = difficult.map((d) => d.word);
    startSession(createSession({ mode: session.mode, direction: session.direction, count: pool.length, rounds: 1, pool }));
    router.replace(session.mode === 'text' ? '/quiz/text' : '/quiz/voice');
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle" style={styles.center}>
          {correct} / {results.length}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {results.length === 0
            ? 'Brak odpowiedzi.'
            : difficult.length === 0
              ? 'Wszystko dobrze, świetna robota!'
              : `Do powtórki: ${difficult.length}`}
        </ThemedText>

        {rounds.length > 1 && (
          <ThemedView type="backgroundElement" style={styles.card}>
            {rounds.map((round, i) => (
              <View key={i} style={styles.row}>
                <ThemedText type="small">Runda {i + 1}</ThemedText>
                <ThemedText type="smallBold">
                  {round.filter((r) => r.grade.correct).length} / {round.length}
                </ThemedText>
              </View>
            ))}
          </ThemedView>
        )}

        {difficult.map(({ word, misses, last }) => (
          <ThemedView key={word.id} type="backgroundElement" style={styles.card}>
            <View style={styles.row}>
              <ThemedText type="smallBold">{last.question.prompt}</ThemedText>
              {rounds.length > 1 && (
                <ThemedText type="small" themeColor="textSecondary">
                  błędów: {misses}
                </ThemedText>
              )}
            </View>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="danger">
                {last.answer || '(brak odpowiedzi)'}
              </ThemedText>
              <ThemedText type="small" themeColor="success">
                {last.question.expected}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {last.grade.feedback}
            </ThemedText>
          </ThemedView>
        ))}

        {difficult.length > 0 && <Button title="Powtórz błędne" onPress={retryDifficult} />}
        <Button title="Nowy quiz" variant="secondary" onPress={() => router.replace('/quiz/setup')} />
        <Button title="Lista słówek" variant="secondary" onPress={() => router.dismissTo('/')} />
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
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
