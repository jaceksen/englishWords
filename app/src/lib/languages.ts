/** Languages the user can learn. The learner's native language is always Polish. */
export const LANGUAGES = {
  en: {
    code: 'en',
    name: 'Angielski',
    /** Completes "Jak …: X?" */
    adverb: 'po angielsku',
    flag: '🇬🇧',
    speech: 'en-US',
    wordPlaceholder: 'np. reluctant',
    contextPlaceholder: 'np. She was reluctant to leave.',
  },
  ru: {
    code: 'ru',
    name: 'Rosyjski',
    adverb: 'po rosyjsku',
    flag: '🇷🇺',
    speech: 'ru-RU',
    wordPlaceholder: 'np. неохотно',
    contextPlaceholder: 'np. Она неохотно ушла с вечеринки.',
  },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type Language = (typeof LANGUAGES)[LanguageCode];

export const NATIVE_SPEECH = 'pl-PL' as const;
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in LANGUAGES;
}
