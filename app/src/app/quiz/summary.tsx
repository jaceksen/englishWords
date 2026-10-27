import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getSession, startSession } from '@/lib/quiz';

export default function SummaryScreen() {
  const session = getSession();
  const results = session?.results ?? [];
  const correct = results.filter((r) => r.grade.correct).length;
  const wrong = results.filter((r) => !r.grade.correct);

  function retryWrong() {
    if (!session) return;
    startSession({ mode: session.mode, questions: wrong.map((r) => r.question), results: [] });
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
            : wrong.length === 0
              ? 'Wszystko dobrze, świetna robota!'
              : `Do powtórki: ${wrong.length}`}
        </ThemedText>

        {wrong.map(({ question, answer, grade }, i) => (
          <ThemedView key={i} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{question.prompt}</ThemedText>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="danger">
                {answer || '(brak odpowiedzi)'}
              </ThemedText>
              <ThemedText type="small" themeColor="success">
                {question.expected}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {grade.feedback}
            </ThemedText>
          </ThemedView>
        ))}

        {wrong.length > 0 && <Button title="Powtórz błędne" onPress={retryWrong} />}
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
