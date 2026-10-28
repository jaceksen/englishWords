/** The learner's CEFR level, used to choose words from photos and texts. Must match LEVELS in functions/src/import.ts. */
export const LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];
export const DEFAULT_LEVEL: Level = 'B1';

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}
