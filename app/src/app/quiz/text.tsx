import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/button';
import { QuestionCard } from '@/components/question-card';
import { RoundBreakCard } from '@/components/round-break-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useQuiz } from '@/hooks/use-quiz';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/settings';

const ROUND_BREAK_MS = 2500;

export default function TextQuizScreen() {
  const theme = useTheme();
  const t = useT();
  const quiz = useQuiz();
  const [answer, setAnswer] = useState('');
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { roundBreak, continueToNextRound } = quiz;

  // Between rounds: show the score briefly, then start the next round without a tap.
  useEffect(() => {
    if (!roundBreak) return;
    const timer = setTimeout(continueToNextRound, ROUND_BREAK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundBreak]);

  if (roundBreak) {
    return (
      <ThemedView style={[styles.container, styles.content]}>
        <RoundBreakCard roundBreak={roundBreak} />
        <Button title={t.common.next} onPress={continueToNextRound} />
      </ThemedView>
    );
  }

  if (!quiz.question) {
    return (
      <ThemedView style={[styles.container, styles.content]}>
        <ThemedText>{t.quiz.noQuiz}</ThemedText>
        <Button title={t.common.back} onPress={() => router.replace('/')} />
      </ThemedView>
    );
  }

  function handleNext() {
    setAnswer('');
    quiz.next();
    inputRef.current?.focus();
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <QuestionCard
            question={quiz.question}
            index={quiz.index}
            total={quiz.total}
            round={quiz.round}
            rounds={quiz.rounds}
            result={quiz.result}
          />
          <TextInput
            ref={inputRef}
            value={answer}
            onChangeText={setAnswer}
            editable={!quiz.result}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t.quiz.yourAnswer}
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            onSubmitEditing={() => (quiz.result ? handleNext() : quiz.submit(answer))}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          {quiz.error && <ThemedText themeColor="danger">{quiz.error}</ThemedText>}
          {quiz.result ? (
            <Button
              title={quiz.index + 1 < quiz.total || quiz.round < quiz.rounds ? t.common.next : t.common.finish}
              onPress={handleNext}
            />
          ) : (
            <Button title={t.quiz.check} onPress={() => quiz.submit(answer)} loading={quiz.grading} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  input: {
    minHeight: 52,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
  },
});
