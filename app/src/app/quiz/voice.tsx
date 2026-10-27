import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { MicButton } from '@/components/mic-button';
import { QuestionCard } from '@/components/question-card';
import { RoundBreakCard, roundBreakMessage } from '@/components/round-break-card';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { Spacing } from '@/constants/theme';
import { useQuiz } from '@/hooks/use-quiz';
import { UI_LANGUAGES } from '@/i18n';
import { LANGUAGES } from '@/lib/languages';
import { useSettings } from '@/lib/settings';
import { speak, stopSpeaking, useSpeechInput } from '@/lib/speech';

const BACKGROUND = require('@/assets/images/backgrounds/bg-quiz-voice.jpg');

const PAUSE_AFTER_RESULT_MS = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function VoiceQuizScreen() {
  const quiz = useQuiz();
  const { t, uiLanguage } = useSettings();
  const speech = useSpeechInput({ noPermission: t.errors.noMicPermission });
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
        await speak(roundBreakMessage(roundBreak, t), uiLanguage.speech);
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
      setStatus(t.voice.reading);
      for (const part of question.spoken) {
        await speak(part.text, part.lang);
        if (cancelled()) return;
      }

      let answer = '';
      for (let attempt = 0; attempt < 2 && !answer; attempt++) {
        if (attempt > 0) {
          await speak(t.spoken.didntHear, uiLanguage.speech);
          if (cancelled()) return;
        }
        setStatus(t.voice.listening);
        answer = await speech.listen(question.answerLang);
        if (cancelled()) return;
      }
      setHeard(answer);

      setStatus(t.voice.checking);
      const result = await quiz.submit(answer);
      if (cancelled() || !result) return;

      setStatus('');
      await speak(result.correct ? t.spoken.correct : t.spoken.wrong, uiLanguage.speech);
      if (!result.correct) {
        await speak(
          question.expected,
          question.direction === 'translate'
            ? UI_LANGUAGES[question.word.nativeLang].speech
            : LANGUAGES[question.word.lang].speech,
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
      <ScreenBackground source={BACKGROUND} style={[styles.container, styles.content]}>
        <RoundBreakCard roundBreak={quiz.roundBreak} />
        <Button title={paused ? t.voice.resume : t.voice.pause} variant="secondary" onPress={() => setPaused((p) => !p)} />
        <Button title={t.voice.end} variant="danger" onPress={() => router.replace('/quiz/summary')} />
      </ScreenBackground>
    );
  }

  if (!quiz.question) {
    return (
      <ScreenBackground source={BACKGROUND} style={[styles.container, styles.content]}>
        <ThemedText>{t.quiz.noQuiz}</ThemedText>
        <Button title={t.common.back} onPress={() => router.replace('/')} />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <QuestionCard
          question={quiz.question}
          index={quiz.index}
          total={quiz.total}
          round={quiz.round}
          rounds={quiz.rounds}
          result={quiz.result}
        />
        <View style={styles.listening}>
          <MicButton listening={speech.listening} onPress={() => speech.stop()} size={88} disabled={!speech.listening} />
          <ThemedText themeColor="textSecondary">{paused ? t.voice.paused : status}</ThemedText>
          {!!(speech.listening ? speech.partial : heard) && (
            <ThemedText type="subtitle" style={styles.heard}>
              {speech.listening ? speech.partial : heard}
            </ThemedText>
          )}
        </View>
        {(quiz.error || speech.error) && <ThemedText themeColor="danger">{quiz.error ?? speech.error}</ThemedText>}
        {quiz.error && <Button title={t.voice.skip} variant="secondary" onPress={quiz.next} />}
        <Button
          title={paused ? t.voice.resume : t.voice.pause}
          variant="secondary"
          onPress={() => setPaused((p) => !p)}
        />
        <Button title={t.voice.end} variant="danger" onPress={() => router.replace('/quiz/summary')} />
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
