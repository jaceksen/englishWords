import { getTranslations, UI_LANGUAGES, type Translations, type UiLanguageCode } from '@/i18n';
import { checkAnswer, type Direction, type Grade } from '@/lib/ai';
import { LANGUAGES, withoutArticle, type Language } from '@/lib/languages';
import type { SpeechLang } from '@/lib/speech';
import type { Word } from '@/lib/words';

export type DirectionChoice = Direction | 'mix';
export type QuizMode = 'text' | 'voice';

export function directionLabel(direction: DirectionChoice, language: Language, uiLang: UiLanguageCode, t: Translations) {
  const code = language.code.toUpperCase();
  const native = uiLang.toUpperCase();
  return {
    translate: `${code} → ${native}`,
    recall: `${native} → ${code}`,
    cloze: t.quiz.cloze,
    mix: t.quiz.mix,
  }[direction];
}

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

export type QuizSession = {
  mode: QuizMode;
  /** App language when the quiz started: questions are asked and read out in it. */
  uiLang: UiLanguageCode;
  direction: DirectionChoice;
  /** Questions per round. */
  count: number;
  rounds: number;
  /** All words in the selected range; later rounds draw fresh words from here. */
  pool: Word[];
  /** 1-based number of the current round. */
  round: number;
  questions: Question[];
  /** Results of the current round. */
  results: QuizResult[];
  completedRounds: QuizResult[][];
};

export const ROUND_OPTIONS = [1, 2, 3, 5] as const;

const BLANK = '____';

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces the word (without its article, plus any inflected ending) in the context sentence.
 * Unicode-aware, so it works for Cyrillic and accented letters.
 */
function clozeSentence(word: Word) {
  const base = withoutArticle(word.word, word.lang);
  const pattern = new RegExp(`(?<!\\p{L})${escapeRegExp(base)}\\p{L}*`, 'iu');
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

function makeQuestion(word: Word, direction: Direction, uiLang: UiLanguageCode): Question {
  const language = LANGUAGES[word.lang];
  const t = getTranslations(uiLang);
  const uiSpeech = UI_LANGUAGES[uiLang].speech;
  // Translations may be in another language than the current UI (words saved before it was changed).
  const translationSpeech = UI_LANGUAGES[word.nativeLang].speech;
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
          { text: t.spoken.fillSentence, lang: uiSpeech },
          // Reading the sentence in parts leaves a pause where the blank is.
          ...sentence
            .split(BLANK)
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => ({ text: part, lang: language.speech })),
          ...(translations ? [{ text: t.spoken.hint(translations), lang: translationSpeech }] : []),
        ],
        answerLang: language.speech,
        expected: word.word,
      };
    }
    direction = translations ? 'recall' : 'translate';
  }
  if (direction === 'recall' && translations) {
    return {
      word,
      direction,
      prompt: translations,
      spoken: [{ text: t.spoken.howToSay(t.inLanguage[word.lang], translations), lang: uiSpeech }],
      answerLang: language.speech,
      expected: word.word,
    };
  }
  return {
    word,
    direction: 'translate',
    prompt: word.word,
    spoken: [
      { text: t.spoken.whatMeans, lang: uiSpeech },
      { text: word.word, lang: language.speech },
    ],
    answerLang: translationSpeech,
    expected: translations || t.quiz.noTranslation,
  };
}

function toQuestions(words: Word[], direction: DirectionChoice, uiLang: UiLanguageCode) {
  const directions: Direction[] = ['translate', 'recall', 'cloze'];
  return words.map((word) =>
    makeQuestion(word, direction === 'mix' ? directions[Math.floor(Math.random() * 3)] : direction, uiLang),
  );
}

/** Least-known words first (lowest Leitner box), random order within a box. */
function pickWords(words: Word[], count: number) {
  return shuffle(words)
    .sort((a, b) => a.stats.box - b.stats.box)
    .slice(0, count);
}

export function createSession(options: {
  mode: QuizMode;
  uiLang: UiLanguageCode;
  direction: DirectionChoice;
  count: number;
  rounds: number;
  pool: Word[];
}): QuizSession {
  return {
    ...options,
    round: 1,
    questions: toQuestions(pickWords(options.pool, options.count), options.direction, options.uiLang),
    results: [],
    completedRounds: [],
  };
}

/**
 * Next round: words answered wrong in the round just finished, topped up with fresh words from the pool
 * (ones not asked yet in this session first) up to the per-round count.
 */
function nextRoundWords(session: QuizSession) {
  const wrong = [...new Map(session.results.filter((r) => !r.grade.correct).map((r) => [r.question.word.id, r.question.word])).values()];
  const wrongIds = new Set(wrong.map((w) => w.id));
  const askedIds = new Set([...session.completedRounds.flat(), ...session.results].map((r) => r.question.word.id));
  const candidates = session.pool.filter((w) => !wrongIds.has(w.id));
  const notAsked = candidates.filter((w) => !askedIds.has(w.id));
  const asked = candidates.filter((w) => askedIds.has(w.id));
  const missing = Math.max(session.count - wrong.length, 0);
  const fresh = [...pickWords(notAsked, missing), ...pickWords(asked, missing)].slice(0, missing);
  return shuffle([...wrong.slice(0, session.count), ...fresh]);
}

export function hasNextRound(session: QuizSession) {
  return session.round < session.rounds;
}

export function startNextRound(session: QuizSession) {
  const words = nextRoundWords(session);
  session.completedRounds.push(session.results);
  session.results = [];
  session.round += 1;
  session.questions = toQuestions(words, session.direction, session.uiLang);
}

/** Every round played so far, including an unfinished current one. */
export function allRounds(session: QuizSession) {
  return [...session.completedRounds, session.results].filter((round) => round.length > 0);
}

/** `lang` is the language of the answer when it is a learned language; null for a native-language answer. */
function normalize(text: string, lang: Word['lang'] | null) {
  let result = text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[.,!?;:"'„”«»()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (lang === 'en') result = result.replace(/^(to|a|an|the)\s+/, '');
  // "ё" is commonly written as "е" in Russian.
  if (lang === 'ru') result = result.replace(/ё/g, 'е');
  return result;
}

/** Exact matches are graded locally; anything else goes to the model for a lenient check. */
export async function grade(question: Question, answer: string, uiLang: UiLanguageCode): Promise<Grade> {
  const { word } = question;
  const expected =
    question.direction === 'translate'
      ? word.translations
      : question.direction === 'cloze'
        ? // The gap holds the bare word, so "Heft" is as good as "das Heft".
          [word.word, withoutArticle(word.word, word.lang)]
        : [word.word];
  const answerLang = question.direction === 'translate' ? null : word.lang;
  if (answer && expected.some((e) => normalize(e, answerLang) === normalize(answer, answerLang))) {
    return { correct: true, score: 1, feedback: getTranslations(uiLang).quiz.exactMatch };
  }
  return checkAnswer({
    lang: word.lang,
    nativeLang: word.nativeLang,
    uiLang,
    direction: question.direction,
    word: word.word,
    translations: word.translations,
    context: word.context,
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
