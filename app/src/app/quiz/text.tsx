import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/button';
import { QuestionCard } from '@/components/question-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useQuiz } from '@/hooks/use-quiz';
import { useTheme } from '@/hooks/use-theme';

export default function TextQuizScreen() {
  const theme = useTheme();
  const quiz = useQuiz();
  const [answer, setAnswer] = useState('');
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  if (!quiz.question) {
    return (
      <ThemedView style={[styles.container, styles.content]}>
        <ThemedText>Brak aktywnego quizu.</ThemedText>
        <Button title="Wróć" onPress={() => router.replace('/')} />
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
          <QuestionCard question={quiz.question} index={quiz.index} total={quiz.total} result={quiz.result} />
          <TextInput
            ref={inputRef}
            value={answer}
            onChangeText={setAnswer}
            editable={!quiz.result}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Twoja odpowiedź"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            onSubmitEditing={() => (quiz.result ? handleNext() : quiz.submit(answer))}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          {quiz.error && <ThemedText themeColor="danger">{quiz.error}</ThemedText>}
          {quiz.result ? (
            <Button title={quiz.index + 1 < quiz.total ? 'Dalej' : 'Zakończ'} onPress={handleNext} />
          ) : (
            <Button title="Sprawdź" onPress={() => quiz.submit(answer)} loading={quiz.grading} />
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
