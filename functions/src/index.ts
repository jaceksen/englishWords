import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { z } from 'zod';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

setGlobalOptions({ region: 'europe-central2', maxInstances: 5 });

const MODEL = 'claude-haiku-5-5';

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic({ apiKey: anthropicApiKey.value() });
  return client;
}

function requireAuth(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Musisz być zalogowany.');
  }
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `Pole "${field}" jest wymagane.`);
  }
  if (value.length > maxLength) {
    throw new HttpsError('invalid-argument', `Pole "${field}" jest za długie.`);
  }
  return value.trim();
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
      throw new HttpsError('internal', 'Model nie zwrócił poprawnej odpowiedzi.');
    }
    return response.parsed_output as z.infer<T>;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof Anthropic.RateLimitError) {
      throw new HttpsError('resource-exhausted', 'Zbyt wiele zapytań, spróbuj za chwilę.');
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API error', error.status, error.message);
      throw new HttpsError('unavailable', 'Usługa AI jest chwilowo niedostępna.');
    }
    throw error;
  }
}

// --- suggestWord ---------------------------------------------------------------

const SuggestionSchema = z.object({
  word: z.string().describe('The English word or phrase, with spelling corrected if needed (e.g. speech-recognition errors).'),
  context: z.string().describe('The context sentence with obvious transcription errors fixed, or empty string if none was given.'),
  translations: z.array(z.string()).describe('1-4 Polish translations, most fitting for the given context first.'),
  partOfSpeech: z.string().describe('Part of speech in Polish, e.g. "rzeczownik", "czasownik", "przymiotnik", "wyrażenie".'),
  definition: z.string().describe('A short English definition (max ~15 words).'),
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

export const suggestWord = onCall({ secrets: [anthropicApiKey] }, async (request): Promise<Suggestion> => {
  requireAuth(request);
  const word = requireString(request.data?.word, 'word', 100);
  const context = typeof request.data?.context === 'string' ? request.data.context.trim().slice(0, 500) : '';

  return parseWithClaude(
    'You help a Polish speaker learn English vocabulary. The input may come from speech recognition, so fix obvious mis-hearings, ' +
      'using the context sentence to disambiguate. Translate into natural Polish matching the meaning used in the context.',
    `Word: ${word}\nContext sentence: ${context || '(none)'}`,
    SuggestionSchema,
  );
});

// --- checkAnswer ---------------------------------------------------------------

const DIRECTIONS = ['en-pl', 'pl-en', 'cloze'] as const;
type Direction = (typeof DIRECTIONS)[number];

const GradeSchema = z.object({
  correct: z.boolean().describe('Whether the answer should be accepted.'),
  score: z.number().describe('0 to 1; 1 = perfect, 0.5 = partially right (e.g. close synonym, minor form error).'),
  feedback: z.string().describe('One short sentence in Polish for the learner; mention the expected answer when wrong.'),
});

export type Grade = z.infer<typeof GradeSchema>;

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[.,!?;:"'„”()]/g, '')
    .replace(/^(to|a|an|the)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const checkAnswer = onCall({ secrets: [anthropicApiKey] }, async (request): Promise<Grade> => {
  requireAuth(request);
  const direction = request.data?.direction as Direction;
  if (!DIRECTIONS.includes(direction)) {
    throw new HttpsError('invalid-argument', 'Nieznany kierunek pytania.');
  }
  const word = requireString(request.data?.word, 'word', 100);
  const userAnswer = typeof request.data?.userAnswer === 'string' ? request.data.userAnswer.trim().slice(0, 300) : '';
  const translations: string[] = Array.isArray(request.data?.translations)
    ? request.data.translations.filter((t: unknown): t is string => typeof t === 'string').slice(0, 10)
    : [];
  const context = typeof request.data?.context === 'string' ? request.data.context.trim().slice(0, 500) : '';

  const expected = direction === 'en-pl' ? translations : [word];
  if (!userAnswer) {
    return { correct: false, score: 0, feedback: `Brak odpowiedzi. Poprawnie: ${expected.join(', ')}.` };
  }
  // Exact match after normalization does not need the model.
  if (expected.some((e) => normalize(e) === normalize(userAnswer))) {
    return { correct: true, score: 1, feedback: 'Dobrze!' };
  }

  const task =
    direction === 'en-pl'
      ? `The learner was shown the English word "${word}" and had to give its Polish meaning.`
      : direction === 'pl-en'
        ? `The learner was shown the Polish meaning "${translations.join(', ')}" and had to give the English word "${word}".`
        : `The learner had to fill the gap with the English word "${word}" in the sentence: "${context.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '____')}".`;

  return parseWithClaude(
    'You grade vocabulary quiz answers for a Polish learner of English. The answer may come from speech recognition: ' +
      'accept homophones and transcription slips when the intended word is clearly the expected one (e.g. "wait" heard ' +
      'for "weight"). Accept valid synonyms and translations that fit the context, ignore ' +
      'articles, capitalization and minor typos. Be fair but do not accept a different meaning.',
    `${task}\nContext sentence: ${context || '(none)'}\nAccepted Polish translations: ${translations.join(', ') || '(none)'}\nLearner answer: "${userAnswer}"`,
    GradeSchema,
  );
});
