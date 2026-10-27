import { router } from 'expo-router';
import { useState } from 'react';

import { aiErrorMessage, type Grade } from '@/lib/ai';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settings';
import { getSession, grade, hasNextRound, startNextRound } from '@/lib/quiz';
import { recordAnswer } from '@/lib/words';

/** Shown between rounds; the quiz screens start the next round automatically after announcing it. */
export type RoundBreak = { round: number; rounds: number; correct: number; total: number };

/** Drives a quiz session started from the setup screen: grading, progress, rounds and saving results. */
export function useQuiz() {
  const { user } = useAuth();
  const { uiLanguageCode, t } = useSettings();
  const [session] = useState(getSession);
  const [round, setRound] = useState(1);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Grade | null>(null);
  const [roundBreak, setRoundBreak] = useState<RoundBreak | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = roundBreak ? null : (session?.questions[index] ?? null);
  const total = session?.questions.length ?? 0;

  async function submit(answer: string): Promise<Grade | null> {
    if (!session || !question || grading) return null;
    setGrading(true);
    setError(null);
    try {
      // Feedback follows the current app language; questions keep the language the quiz started in.
      const g = await grade(question, answer, uiLanguageCode);
      session.results.push({ question, answer, grade: g });
      setResult(g);
      if (user) recordAnswer(user.uid, question.word, g.correct).catch(() => {});
      return g;
    } catch (e) {
      setError(aiErrorMessage(e, t));
      return null;
    } finally {
      setGrading(false);
    }
  }

  function next() {
    setResult(null);
    setError(null);
    if (!session) return;
    if (index + 1 < total) {
      setIndex(index + 1);
    } else if (hasNextRound(session)) {
      setRoundBreak({
        round: session.round,
        rounds: session.rounds,
        correct: session.results.filter((r) => r.grade.correct).length,
        total: session.results.length,
      });
    } else {
      router.replace('/quiz/summary');
    }
  }

  function continueToNextRound() {
    if (!session || !roundBreak) return;
    startNextRound(session);
    setRoundBreak(null);
    setIndex(0);
    setRound(session.round);
  }

  return {
    session,
    question,
    index,
    total,
    round,
    rounds: session?.rounds ?? 1,
    result,
    roundBreak,
    grading,
    error,
    submit,
    next,
    continueToNextRound,
  };
}
