import { httpsCallable } from '@react-native-firebase/functions';

import { functions } from '@/lib/firebase';
import type { LanguageCode } from '@/lib/languages';

// Shapes mirror functions/src/index.ts.
export type Suggestion = {
  word: string;
  context: string;
  translations: string[];
  partOfSpeech: string;
  definition: string;
};

/** translate: foreign word → Polish; recall: Polish → foreign word; cloze: fill the gap in the sentence. */
export type Direction = 'translate' | 'recall' | 'cloze';

export type Grade = { correct: boolean; score: number; feedback: string };

type CheckAnswerRequest = {
  lang: LanguageCode;
  direction: Direction;
  word: string;
  translations: string[];
  context: string;
  userAnswer: string;
};

const suggestWordFn = httpsCallable<{ lang: LanguageCode; word: string; context: string }, Suggestion>(
  functions,
  'suggestWord',
);
const checkAnswerFn = httpsCallable<CheckAnswerRequest, Grade>(functions, 'checkAnswer');

export async function suggestWord(lang: LanguageCode, word: string, context: string) {
  return (await suggestWordFn({ lang, word, context })).data;
}

export async function checkAnswer(request: CheckAnswerRequest) {
  return (await checkAnswerFn(request)).data;
}
