import { checkAnswer, type Direction, type Grade } from '@/lib/ai';
import type { SpeechLang } from '@/lib/speech';
import type { Word } from '@/lib/words';

export type DirectionChoice = Direction | 'mix';
export type QuizMode = 'text' | 'voice';

export const DIRECTION_LABELS: Record<DirectionChoice, string> = {
  'en-pl': 'EN → PL',
  'pl-en': 'PL → EN',
  cloze: 'Zdanie z luką',
  mix: 'Mieszane',
};

export type Question = {
  word: Word;
  direction: Direction;
  /** Shown on screen. */
  prompt: string;
  /** Read aloud in voice mode. */
  spoken: { text: string; lang: SpeechLang }[];
  answerLang: SpeechLang;
  expected: string;
};

export type QuizResult = { question: Question; answer: string; grade: Grade };

export type QuizSession = { mode: QuizMode; questions: Question[]; results: QuizResult[] };

const BLANK = '____';

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clozeSentence(word: Word) {
  const pattern = new RegExp(`\\b${escapeRegExp(word.word)}\\w*`, 'i');
  return pattern.test(word.context) ? word.context.replace(pattern, BLANK) : null;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeQuestion(word: Word, direction: Direction): Question {
  const translations = word.translations.join(', ');
  if (direction === 'cloze') {
    const sentence = clozeSentence(word);
    // Without a usable context sentence, fall back to a plain translation question.
    if (sentence) {
      return {
        word,
        direction,
        prompt: sentence,
        spoken: [
          { text: 'Uzupełnij zdanie.', lang: 'pl-PL' },
          { text: sentence.replace(BLANK, 'blank'), lang: 'en-US' },
          ...(translations ? [{ text: `Podpowiedź: ${translations}`, lang: 'pl-PL' as const }] : []),
        ],
        answerLang: 'en-US',
        expected: word.word,
      };
    }
    direction = translations ? 'pl-en' : 'en-pl';
  }
  if (direction === 'pl-en' && translations) {
    return {
      word,
      direction,
      prompt: translations,
      spoken: [{ text: `Jak po angielsku: ${translations}?`, lang: 'pl-PL' }],
      answerLang: 'en-US',
      expected: word.word,
    };
  }
  return {
    word,
    direction: 'en-pl',
    prompt: word.word,
    spoken: [
      { text: 'Co znaczy', lang: 'pl-PL' },
      { text: word.word, lang: 'en-US' },
    ],
    answerLang: 'pl-PL',
    expected: translations || '(brak tłumaczenia)',
  };
}

/** Least-known words first (lowest Leitner box), random order within a box. */
export function buildQuestions(words: Word[], direction: DirectionChoice, count: number) {
  const ordered = shuffle(words).sort((a, b) => a.stats.box - b.stats.box);
  const directions: Direction[] = ['en-pl', 'pl-en', 'cloze'];
  return ordered
    .slice(0, count)
    .map((word) => makeQuestion(word, direction === 'mix' ? directions[Math.floor(Math.random() * 3)] : direction));
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[.,!?;:"'„”()]/g, '')
    .replace(/^(to|a|an|the)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exact matches are graded locally; anything else goes to the model for a lenient check. */
export async function grade(question: Question, answer: string): Promise<Grade> {
  const expected = question.direction === 'en-pl' ? question.word.translations : [question.word.word];
  if (answer && expected.some((e) => normalize(e) === normalize(answer))) {
    return { correct: true, score: 1, feedback: 'Dobrze!' };
  }
  return checkAnswer({
    direction: question.direction,
    word: question.word.word,
    translations: question.word.translations,
    context: question.word.context,
    userAnswer: answer,
  });
}

// The running session is shared between the quiz and summary screens.
let current: QuizSession | null = null;

export function startSession(session: QuizSession) {
  current = session;
}

export function getSession() {
  return current;
}
