import { httpsCallable } from '@react-native-firebase/functions';

import { functions } from '@/lib/firebase';

// Shapes mirror functions/src/index.ts.
export type Suggestion = {
  word: string;
  context: string;
  translations: string[];
  partOfSpeech: string;
  definition: string;
};

export type Direction = 'en-pl' | 'pl-en' | 'cloze';

export type Grade = { correct: boolean; score: number; feedback: string };

type CheckAnswerRequest = {
  direction: Direction;
  word: string;
  translations: string[];
  context: string;
  userAnswer: string;
};

const suggestWordFn = httpsCallable<{ word: string; context: string }, Suggestion>(functions, 'suggestWord');
const checkAnswerFn = httpsCallable<CheckAnswerRequest, Grade>(functions, 'checkAnswer');

export async function suggestWord(word: string, context: string) {
  return (await suggestWordFn({ word, context })).data;
}

export async function checkAnswer(request: CheckAnswerRequest) {
  return (await checkAnswerFn(request)).data;
}
