import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Grade } from '@/lib/ai';
import { DIRECTION_LABELS, type Question } from '@/lib/quiz';

type QuestionCardProps = {
  question: Question;
  index: number;
  total: number;
  result: Grade | null;
};

const INSTRUCTIONS = {
  'en-pl': 'Podaj polskie znaczenie',
  'pl-en': 'Podaj słówko po angielsku',
  cloze: 'Uzupełnij lukę',
} as const;

export function QuestionCard({ question, index, total, result }: QuestionCardProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {index + 1} / {total} · {DIRECTION_LABELS[question.direction]}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {INSTRUCTIONS[question.direction]}
      </ThemedText>
      <ThemedText style={question.direction === 'cloze' ? styles.sentence : styles.prompt}>{question.prompt}</ThemedText>
      {question.direction === 'cloze' && question.word.translations.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Podpowiedź: {question.word.translations.join(', ')}
        </ThemedText>
      )}
      {result && (
        <ThemedView type="background" style={styles.result}>
          <ThemedText type="smallBold" themeColor={result.correct ? 'success' : 'danger'}>
            {result.correct ? '✓ Dobrze' : '✗ Źle'}
          </ThemedText>
          <ThemedText type="small">{result.feedback}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Odpowiedź: {question.expected}
          </ThemedText>
          {!!question.word.context && question.direction !== 'cloze' && (
            <ThemedText type="small" themeColor="textSecondary">
              „{question.word.context}”
            </ThemedText>
          )}
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  prompt: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: 600,
  },
  sentence: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: 500,
  },
  result: {
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
