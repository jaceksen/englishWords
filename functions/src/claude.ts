import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';

export const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-5-5';
/** Gold plan: reading words from photos and texts (Haiku misses underlined words too often). */
const PREMIUM_MODEL = 'claude-sonnet-5-5';

// Must match app/src/lib/languages.ts. `notes` are language-specific hints for the model.
export const LANGUAGES = {
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
export type LanguageCode = keyof typeof LANGUAGES;
export type Language = (typeof LANGUAGES)[LanguageCode];

// The learner's native language (the app language): translations go into it and feedback is written in it.
// Must match app/src/i18n/index.ts. The short texts are for answers graded without the model.
export const NATIVE_LANGUAGES = {
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

export function requireAuth(request: CallableRequest): asserts request is CallableRequest & {
  auth: NonNullable<CallableRequest['auth']>;
} {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
}

export function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `Field "${field}" is required.`);
  }
  if (value.length > maxLength) {
    throw new HttpsError('invalid-argument', `Field "${field}" is too long.`);
  }
  return value.trim();
}

/** Older app versions did not send `lang`; they only supported English. */
export function requireLanguageCode(value: unknown): LanguageCode {
  const code = value ?? 'en';
  if (typeof code !== 'string' || !(code in LANGUAGES)) {
    throw new HttpsError('invalid-argument', 'Unsupported language.');
  }
  return code as LanguageCode;
}

export function requireLanguage(value: unknown) {
  return LANGUAGES[requireLanguageCode(value)];
}

/** Older app versions did not send native/UI languages; they were Polish-only. */
export function requireNativeLanguage(value: unknown) {
  const code = value ?? 'pl';
  if (typeof code !== 'string' || !(code in NATIVE_LANGUAGES)) {
    throw new HttpsError('invalid-argument', 'Unsupported native language.');
  }
  return NATIVE_LANGUAGES[code as NativeLanguageCode];
}

type ParseOptions = {
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  /** Use the premium model (Gold plan) instead of the default one. */
  premium?: boolean;
};

export async function parseWithClaude<T extends z.ZodType>(
  system: string,
  prompt: string | Anthropic.ContentBlockParam[],
  schema: T,
  { maxTokens = 2048, effort = 'low', premium = false }: ParseOptions = {},
) {
  try {
    const response = premium
      ? // If the model declines, the API retries on a model it picks for the refusal category.
        await getClient().beta.messages.parse({
          model: PREMIUM_MODEL,
          max_tokens: maxTokens,
          output_config: { effort, format: betaZodOutputFormat(schema) },
          system,
          messages: [{ role: 'user', content: prompt }],
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
      : await getClient().messages.parse({
          model: MODEL,
          max_tokens: maxTokens,
          output_config: { effort, format: zodOutputFormat(schema) },
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
