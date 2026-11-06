import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { RANGE_KEYS, type RangeKey } from '@/lib/dates';
import { ROUND_OPTIONS, type DirectionChoice, type QuizMode } from '@/lib/quiz';

/** Choices from the quiz settings screen; the quiz screen starts a session with them. */
export type QuizOptions = {
  range: RangeKey;
  direction: DirectionChoice;
  mode: QuizMode;
  /** Questions per round; 0 = all words in the range. */
  count: number;
  /** Infinity: endless. */
  rounds: number;
  /** Voice quiz (Gold): read the word's example sentence after a wrong answer, or after every answer. */
  example: ExampleMode;
};

export type ExampleMode = 'off' | 'wrong' | 'all';

const DEFAULTS: QuizOptions = { range: 'today', direction: 'translate', mode: 'voice', count: 10, rounds: 1, example: 'off' };

const DIRECTIONS: DirectionChoice[] = ['translate', 'recall', 'cloze', 'mix'];
const MODES: QuizMode[] = ['text', 'voice'];
const EXAMPLES: ExampleMode[] = ['off', 'wrong', 'all'];

/** Kept on the device only, so the choices survive restarting the app. */
const file = new File(Paths.document, 'quiz-options.json');

/** Saved options, each one checked; anything unknown or missing falls back to its default. */
function load(): QuizOptions {
  try {
    if (!file.exists) return DEFAULTS;
    const saved = JSON.parse(file.textSync());
    // JSON has no Infinity, so endless rounds are saved as the string "Infinity".
    const rounds = saved.rounds === 'Infinity' ? Infinity : saved.rounds;
    const pick = <T>(allowed: readonly T[], value: unknown, fallback: T) =>
      allowed.includes(value as T) ? (value as T) : fallback;
    return {
      range: pick(RANGE_KEYS, saved.range, DEFAULTS.range),
      direction: pick(DIRECTIONS, saved.direction, DEFAULTS.direction),
      mode: pick(MODES, saved.mode, DEFAULTS.mode),
      count: Number.isInteger(saved.count) && saved.count >= 0 ? saved.count : DEFAULTS.count,
      rounds: pick(ROUND_OPTIONS, rounds, DEFAULTS.rounds),
      example: pick(EXAMPLES, saved.example, DEFAULTS.example),
    };
  } catch {
    return DEFAULTS;
  }
}

function save() {
  try {
    file.writeSync(JSON.stringify({ ...options, rounds: Number.isFinite(options.rounds) ? options.rounds : 'Infinity' }));
  } catch {
    // Not saving only means the defaults come back next time.
  }
}

let options = load();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setQuizOptions(patch: Partial<QuizOptions>) {
  options = { ...options, ...patch };
  save();
  listeners.forEach((listener) => listener());
}

/** Shared between the quiz and quiz settings screens. */
export function useQuizOptions() {
  return useSyncExternalStore(subscribe, () => options);
}
