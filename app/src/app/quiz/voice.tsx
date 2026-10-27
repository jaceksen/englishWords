import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { MicButton } from '@/components/mic-button';
import { QuestionCard } from '@/components/question-card';
import { RoundBreakCard, roundBreakMessage } from '@/components/round-break-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useQuiz } from '@/hooks/use-quiz';
import { LANGUAGES, NATIVE_SPEECH } from '@/lib/languages';
import { speak, stopSpeaking, useSpeechInput } from '@/lib/speech';

const PAUSE_AFTER_RESULT_MS = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function VoiceQuizScreen() {
  const quiz = useQuiz();
  const speech = useSpeechInput();
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('');
  const [heard, setHeard] = useState('');

  // One hands-free pass per question: read it out, listen, grade, read the result, move on.
  useEffect(() => {
    const question = quiz.question;
    const roundBreak = quiz.roundBreak;
    if ((!question && !roundBreak) || paused) return;
    let active = true;
    const cancelled = () => !active;

    (async () => {
      // Between rounds: announce the score, then carry on without a tap.
      if (roundBreak) {
        setStatus('');
        await speak(roundBreakMessage(roundBreak), NATIVE_SPEECH);
        if (!cancelled()) quiz.continueToNextRound();
        return;
      }
      if (!question) return;
      // Resumed after this question was already graded: just move on.
      if (quiz.result) {
        quiz.next();
        return;
      }
      setHeard('');
      setStatus('Czytam pytanie…');
      for (const part of question.spoken) {
        await speak(part.text, part.lang);
        if (cancelled()) return;
      }

      let answer = '';
      for (let attempt = 0; attempt < 2 && !answer; attempt++) {
        if (attempt > 0) {
          await speak('Nie usłyszałem. Powtórz, proszę.', NATIVE_SPEECH);
          if (cancelled()) return;
        }
        setStatus('Słucham…');
        answer = await speech.listen(question.answerLang);
        if (cancelled()) return;
      }
      setHeard(answer);

      setStatus('Sprawdzam…');
      const result = await quiz.submit(answer);
      if (cancelled() || !result) return;

      setStatus('');
      await speak(result.correct ? 'Dobrze!' : 'Niestety nie.', NATIVE_SPEECH);
      if (!result.correct) {
        await speak(
          question.expected,
          question.direction === 'translate' ? NATIVE_SPEECH : LANGUAGES[question.word.lang].speech,
        );
      }
      await sleep(PAUSE_AFTER_RESULT_MS);
      if (cancelled()) return;
      quiz.next();
    })();

    return () => {
      active = false;
      stopSpeaking();
      speech.abort();
    };
    // Re-run only when the question or round changes, or the quiz is resumed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.index, quiz.round, quiz.roundBreak, paused]);

  if (quiz.roundBreak) {
    return (
      <ThemedView style={[styles.container, styles.content]}>
        <RoundBreakCard roundBreak={quiz.roundBreak} />
        <Button title={paused ? '▶ Wznów' : '⏸ Pauza'} variant="secondary" onPress={() => setPaused((p) => !p)} />
        <Button title="Zakończ quiz" variant="danger" onPress={() => router.replace('/quiz/summary')} />
      </ThemedView>
    );
  }

  if (!quiz.question) {
    return (
      <ThemedView style={[styles.container, styles.content]}>
        <ThemedText>Brak aktywnego quizu.</ThemedText>
        <Button title="Wróć" onPress={() => router.replace('/')} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <QuestionCard
          question={quiz.question}
          index={quiz.index}
          total={quiz.total}
          round={quiz.round}
          rounds={quiz.rounds}
          result={quiz.result}
        />
        <ThemedView style={styles.listening}>
          <MicButton listening={speech.listening} onPress={() => speech.stop()} size={88} disabled={!speech.listening} />
          <ThemedText themeColor="textSecondary">{paused ? 'Wstrzymano' : status}</ThemedText>
          {!!(speech.listening ? speech.partial : heard) && (
            <ThemedText type="subtitle" style={styles.heard}>
              {speech.listening ? speech.partial : heard}
            </ThemedText>
          )}
        </ThemedView>
        {(quiz.error || speech.error) && <ThemedText themeColor="danger">{quiz.error ?? speech.error}</ThemedText>}
        {quiz.error && <Button title="Pomiń pytanie" variant="secondary" onPress={quiz.next} />}
        <Button
          title={paused ? '▶ Wznów' : '⏸ Pauza'}
          variant="secondary"
          onPress={() => setPaused((p) => !p)}
        />
        <Button title="Zakończ quiz" variant="danger" onPress={() => router.replace('/quiz/summary')} />
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
  listening: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  heard: {
    textAlign: 'center',
  },
});
