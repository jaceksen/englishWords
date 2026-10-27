import { router } from 'expo-router';
import { useState } from 'react';

import type { Grade } from '@/lib/ai';
import { useAuth } from '@/lib/auth';
import { getSession, grade } from '@/lib/quiz';
import { recordAnswer } from '@/lib/words';

/** Drives a quiz session started from the setup screen: grading, progress and saving results. */
export function useQuiz() {
  const { user } = useAuth();
  const [session] = useState(getSession);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Grade | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = session?.questions[index] ?? null;
  const total = session?.questions.length ?? 0;

  async function submit(answer: string): Promise<Grade | null> {
    if (!session || !question || grading) return null;
    setGrading(true);
    setError(null);
    try {
      const g = await grade(question, answer);
      session.results.push({ question, answer, grade: g });
      setResult(g);
      if (user) recordAnswer(user.uid, question.word, g.correct).catch(() => {});
      return g;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setGrading(false);
    }
  }

  function next() {
    setResult(null);
    setError(null);
    if (index + 1 >= total) {
      router.replace('/quiz/summary');
    } else {
      setIndex(index + 1);
    }
  }

  return { session, question, index, total, result, grading, error, submit, next };
}
