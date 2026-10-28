import './options.js';

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  anthropicApiKey,
  parseWithClaude,
  requireAuth,
  requireLanguage,
  requireNativeLanguage,
  requireString,
} from './claude.js';

// --- suggestWord ---------------------------------------------------------------

const SuggestionSchema = z.object({
  word: z.string().describe('The word or phrase in the target language, with spelling corrected if needed (e.g. speech-recognition errors).'),
  context: z.string().describe('The context sentence with obvious transcription errors fixed, or empty string if none was given.'),
  translations: z.array(z.string()).describe("1-4 translations into the learner's native language, most fitting for the context first."),
  partOfSpeech: z.string().describe("Part of speech, written in the learner's native language (e.g. noun, verb, adjective, phrase)."),
  definition: z.string().describe('A short definition in the target language (max ~15 words).'),
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

export const suggestWord = onCall({ secrets: [anthropicApiKey] }, async (request): Promise<Suggestion> => {
  requireAuth(request);
  const language = requireLanguage(request.data?.lang);
  const native = requireNativeLanguage(request.data?.nativeLang);
  const word = requireString(request.data?.word, 'word', 100);
  const context = typeof request.data?.context === 'string' ? request.data.context.trim().slice(0, 500) : '';
  const sameLanguage = native.name === language.name;

  return parseWithClaude(
    `You help a ${native.name} speaker learn ${language.name} vocabulary. The input may come from speech recognition, so ` +
      'fix obvious mis-hearings, using the context sentence to disambiguate. ' +
      (sameLanguage
        ? `As the learner's native language is also ${native.name}, give simpler synonyms or very short explanations as translations. `
        : `Translate into natural ${native.name} matching the meaning used in the context. `) +
      `Write the part of speech in ${native.name}. Write the definition in ${language.name}. ` +
      language.notes,
    `Target language: ${language.name}\nNative language: ${native.name}\nWord: ${word}\nContext sentence: ${context || '(none)'}`,
    SuggestionSchema,
  );
});

// --- suggestSentence -----------------------------------------------------------

const SentenceSchema = z.object({
  sentence: z.string().describe('One short, simple example sentence in the target language that uses the word.'),
});

export type SentenceSuggestion = z.infer<typeof SentenceSchema>;

export const suggestSentence = onCall({ secrets: [anthropicApiKey] }, async (request): Promise<SentenceSuggestion> => {
  requireAuth(request);
  const language = requireLanguage(request.data?.lang);
  const native = requireNativeLanguage(request.data?.nativeLang);
  const word = requireString(request.data?.word, 'word', 100);
  const translations: string[] = Array.isArray(request.data?.translations)
    ? request.data.translations.filter((t: unknown): t is string => typeof t === 'string').slice(0, 10)
    : [];

  return parseWithClaude(
    `You write example sentences for a ${native.name} speaker learning ${language.name} vocabulary. ` +
      'Write exactly one natural, everyday sentence of 5-12 words at a beginner (A2) level that clearly shows what the ' +
      'word means. Use the word itself (a different grammatical form is fine) and avoid other rare words. ' +
      `If translations are given, use the word in that meaning. ${language.notes}`,
    `Target language: ${language.name}\nWord: ${word}\nMeaning (${native.name}): ${translations.join(', ') || '(not given)'}`,
    SentenceSchema,
  );
});

// --- checkAnswer ---------------------------------------------------------------

/** translate: foreign word → native; recall: native → foreign word; cloze: fill the gap in the sentence. */
const DIRECTIONS = ['translate', 'recall', 'cloze'] as const;
type Direction = (typeof DIRECTIONS)[number];

// Names used by app versions released before multi-language support.
const LEGACY_DIRECTIONS: Record<string, Direction> = { 'en-pl': 'translate', 'pl-en': 'recall' };

const GradeSchema = z.object({
  correct: z.boolean().describe('Whether the answer should be accepted.'),
  score: z.number().describe('0 to 1; 1 = perfect, 0.5 = partially right (e.g. close synonym, minor form error).'),
  feedback: z.string().describe("One short sentence for the learner in the requested feedback language; mention the expected answer when wrong."),
});

export type Grade = z.infer<typeof GradeSchema>;

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:"'„”«»()]/g, '')
    .replace(/^(to|a|an|the)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const checkAnswer = onCall({ secrets: [anthropicApiKey] }, async (request): Promise<Grade> => {
  requireAuth(request);
  const language = requireLanguage(request.data?.lang);
  // Language of the stored translations, and the language to write the feedback in.
  const native = requireNativeLanguage(request.data?.nativeLang);
  const ui = requireNativeLanguage(request.data?.uiLang ?? request.data?.nativeLang);
  const rawDirection = request.data?.direction;
  const direction = (LEGACY_DIRECTIONS[rawDirection] ?? rawDirection) as Direction;
  if (!DIRECTIONS.includes(direction)) {
    throw new HttpsError('invalid-argument', 'Unknown question direction.');
  }
  const word = requireString(request.data?.word, 'word', 100);
  const userAnswer = typeof request.data?.userAnswer === 'string' ? request.data.userAnswer.trim().slice(0, 300) : '';
  const translations: string[] = Array.isArray(request.data?.translations)
    ? request.data.translations.filter((t: unknown): t is string => typeof t === 'string').slice(0, 10)
    : [];
  const context = typeof request.data?.context === 'string' ? request.data.context.trim().slice(0, 500) : '';

  const expected = direction === 'translate' ? translations : [word];
  if (!userAnswer) {
    return { correct: false, score: 0, feedback: `${ui.noAnswer} ${expected.join(', ')}.` };
  }
  // Exact match after normalization does not need the model.
  if (expected.some((e) => normalize(e) === normalize(userAnswer))) {
    return { correct: true, score: 1, feedback: ui.correct };
  }

  // Sentences contain the bare word ("Heft"), while the stored word may carry its article ("das Heft").
  const base = language.article ? word.replace(language.article, '') : word;
  const gapped = context.replace(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), '____');
  const task = {
    translate: `The learner was shown the ${language.name} word "${word}" and had to give its meaning in ${native.name} (an answer in ${ui.name} is fine too).`,
    recall: `The learner was shown the ${native.name} meaning "${translations.join(', ')}" and had to give the ${language.name} word "${word}".`,
    cloze: `The learner had to fill the gap with the ${language.name} word "${word}" in the sentence: "${gapped}".`,
  }[direction];

  return parseWithClaude(
    `You grade vocabulary quiz answers for a learner of ${language.name}. Write the feedback in ${ui.name}. ` +
      'The answer may come from speech recognition: ' +
      'accept homophones and transcription slips when the intended word is clearly the expected one (e.g. "wait" heard ' +
      'for "weight"). Accept valid synonyms and translations that fit the context, ignore articles, capitalization and ' +
      `minor typos. Be fair but do not accept a different meaning. ${language.notes}`,
    `${task}\nContext sentence: ${context || '(none)'}\nAccepted ${native.name} translations: ${translations.join(', ') || '(none)'}\nLearner answer: "${userAnswer}"`,
    GradeSchema,
  );
});

export * from './account.js';
export * from './billing.js';
export * from './import.js';
export * from './revenuecat.js';
export * from './tts.js';
