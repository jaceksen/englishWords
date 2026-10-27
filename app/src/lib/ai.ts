import { httpsCallable } from '@react-native-firebase/functions';

import type { Translations, UiLanguageCode } from '@/i18n';
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

/** translate: foreign word → native; recall: native → foreign word; cloze: fill the gap in the sentence. */
export type Direction = 'translate' | 'recall' | 'cloze';

export type Grade = { correct: boolean; score: number; feedback: string };

type SuggestWordRequest = {
  lang: LanguageCode;
  /** Language to translate into (the learner's native language). */
  nativeLang: UiLanguageCode;
  word: string;
  context: string;
};

type SuggestSentenceRequest = {
  lang: LanguageCode;
  /** Language of `translations`. */
  nativeLang: UiLanguageCode;
  word: string;
  /** Meaning to use the word in, when known. */
  translations: string[];
};

type CheckAnswerRequest = {
  lang: LanguageCode;
  /** Language of the word's stored translations. */
  nativeLang: UiLanguageCode;
  /** Language for the feedback. */
  uiLang: UiLanguageCode;
  direction: Direction;
  word: string;
  translations: string[];
  context: string;
  userAnswer: string;
};

const suggestWordFn = httpsCallable<SuggestWordRequest, Suggestion>(functions, 'suggestWord');
const suggestSentenceFn = httpsCallable<SuggestSentenceRequest, { sentence: string }>(functions, 'suggestSentence');
const checkAnswerFn = httpsCallable<CheckAnswerRequest, Grade>(functions, 'checkAnswer');

export async function suggestWord(request: SuggestWordRequest) {
  return (await suggestWordFn(request)).data;
}

export async function suggestSentence(request: SuggestSentenceRequest) {
  return (await suggestSentenceFn(request)).data.sentence;
}

export async function checkAnswer(request: CheckAnswerRequest) {
  return (await checkAnswerFn(request)).data;
}

/** Message in the app language for a failed AI call. */
export function aiErrorMessage(error: unknown, t: Translations) {
  const code = String((error as { code?: string } | null)?.code ?? '').replace(/^functions\//, '');
  return code === 'resource-exhausted' ? t.errors.aiBusy : t.errors.aiUnavailable;
}
