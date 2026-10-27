/**
 * Languages the user can learn. Their names in the current app language live in the translations
 * (`t.languageNames`, `t.inLanguage`).
 */
export const LANGUAGES = {
  en: {
    code: 'en',
    flag: '🇬🇧',
    speech: 'en-US',
    /** Leading article (or infinitive "to"), stripped to find the word in a sentence. */
    article: /^(?:the|an?|to)\s+/i,
    wordExample: 'reluctant',
    contextExample: 'She was reluctant to leave.',
  },
  ru: {
    code: 'ru',
    flag: '🇷🇺',
    speech: 'ru-RU',
    article: null,
    wordExample: 'неохотно',
    contextExample: 'Она неохотно ушла с вечеринки.',
  },
  es: {
    code: 'es',
    flag: '🇪🇸',
    speech: 'es-ES',
    article: /^(?:el|la|los|las|un|una)\s+/i,
    wordExample: 'el cuaderno',
    contextExample: 'Compré un cuaderno nuevo.',
  },
  de: {
    code: 'de',
    flag: '🇩🇪',
    speech: 'de-DE',
    article: /^(?:der|die|das|ein|eine)\s+/i,
    wordExample: 'das Heft',
    contextExample: 'Ich habe ein neues Heft gekauft.',
  },
  fr: {
    code: 'fr',
    flag: '🇫🇷',
    speech: 'fr-FR',
    article: /^(?:(?:le|la|les|un|une)\s+|l['’])/i,
    wordExample: 'le cahier',
    contextExample: "J'ai acheté un nouveau cahier.",
  },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type Language = (typeof LANGUAGES)[LanguageCode];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** "das Heft" → "Heft": the form that appears inside a sentence. */
export function withoutArticle(text: string, code: LanguageCode) {
  const { article } = LANGUAGES[code];
  return article ? text.replace(article, '') : text;
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in LANGUAGES;
}
