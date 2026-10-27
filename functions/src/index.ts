import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { z } from 'zod';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

setGlobalOptions({ region: 'europe-central2', maxInstances: 5 });

const MODEL = 'claude-haiku-5-5';

// Must match app/src/lib/languages.ts. `notes` are language-specific hints for the model.
const LANGUAGES = {
  en: { name: 'English', article: /^(?:the|an?|to)\s+/i, notes: '' },
  ru: {
    name: 'Russian',
    article: null,
    notes:
      'Always write Russian in Cyrillic; if the learner typed it in Latin transliteration, convert it. ' +
      'Treat "е" and "ё" as equivalent. Accept a different grammatical case or aspect only if the meaning is the same.',
  },
  es: {
    name: 'Spanish',
    article: /^(?:el|la|los|las|un|una)\s+/i,
    notes:
      'In the word field, always write nouns with their definite article, e.g. "el cuaderno", "la mesa". Accept answers without the article or with missing ' +
      'accents (á, é, í, ó, ú, ñ) as correct, but mention the correct form in the feedback.',
  },
  de: {
    name: 'German',
    article: /^(?:der|die|das|ein|eine)\s+/i,
    notes:
      'In the word field, always write nouns capitalized with their definite article, e.g. "das Heft", "die Tür"; ' +
      'fix capitalization in the context sentence. Ignore capitalization and accept ' +
      '"ae/oe/ue/ss" for "ä/ö/ü/ß". Accept a noun without its article as correct, but mention the correct article in the feedback.',
  },
  fr: {
    name: 'French',
    article: /^(?:(?:le|la|les|un|une)\s+|l['’])/i,
    notes:
      "In the word field, always write nouns with their definite article, e.g. \"le cahier\", \"l'arbre\". Accept answers without the article or with missing " +
      'accents (é, è, ê, à, ç…) as correct, but mention the correct form in the feedback.',
  },
} as const;
type LanguageCode = keyof typeof LANGUAGES;

// The learner's native language (the app language): translations go into it and feedback is written in it.
// Must match app/src/i18n/index.ts. The short texts are for answers graded without the model.
const NATIVE_LANGUAGES = {
  pl: { name: 'Polish', correct: 'Dobrze!', noAnswer: 'Brak odpowiedzi. Poprawnie:' },
  en: { name: 'English', correct: 'Correct!', noAnswer: 'No answer. Correct answer:' },
  es: { name: 'Spanish', correct: '¡Correcto!', noAnswer: 'Sin respuesta. Respuesta correcta:' },
  de: { name: 'German', correct: 'Richtig!', noAnswer: 'Keine Antwort. Richtig wäre:' },
  fr: { name: 'French', correct: 'Correct !', noAnswer: 'Pas de réponse. Bonne réponse :' },
  ru: { name: 'Russian', correct: 'Верно!', noAnswer: 'Нет ответа. Правильный ответ:' },
} as const;
type NativeLanguageCode = keyof typeof NATIVE_LANGUAGES;

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic({ apiKey: anthropicApiKey.value() });
  return client;
}

function requireAuth(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `Field "${field}" is required.`);
  }
  if (value.length > maxLength) {
    throw new HttpsError('invalid-argument', `Field "${field}" is too long.`);
  }
  return value.trim();
}

/** Older app versions did not send `lang`; they only supported English. */
function requireLanguage(value: unknown) {
  const code = value ?? 'en';
  if (typeof code !== 'string' || !(code in LANGUAGES)) {
    throw new HttpsError('invalid-argument', 'Unsupported language.');
  }
  return LANGUAGES[code as LanguageCode];
}

/** Older app versions did not send native/UI languages; they were Polish-only. */
function requireNativeLanguage(value: unknown) {
  const code = value ?? 'pl';
  if (typeof code !== 'string' || !(code in NATIVE_LANGUAGES)) {
    throw new HttpsError('invalid-argument', 'Unsupported native language.');
  }
  return NATIVE_LANGUAGES[code as NativeLanguageCode];
}

async function parseWithClaude<T extends z.ZodType>(system: string, prompt: string, schema: T) {
  try {
    const response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: 'low', format: zodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new HttpsError('internal', 'The model did not return a valid answer.');
    }
    return response.parsed_output as z.infer<T>;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof Anthropic.RateLimitError) {
      throw new HttpsError('resource-exhausted', 'Too many requests, try again shortly.');
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API error', error.status, error.message);
      throw new HttpsError('unavailable', 'The AI service is temporarily unavailable.');
    }
    throw error;
  }
}

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
