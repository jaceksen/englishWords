import de from '@/i18n/de';
import en from '@/i18n/en';
import es from '@/i18n/es';
import fr from '@/i18n/fr';
import pl, { type Translations } from '@/i18n/pl';
import ru from '@/i18n/ru';

export type { Translations };

/**
 * Languages the app can be used in. This is also the learner's native language: new words are translated
 * into it, and quiz questions and feedback use it. `name` is the language's own name, for the picker.
 */
export const UI_LANGUAGES = {
  pl: { code: 'pl', name: 'Polski', flag: '🇵🇱', speech: 'pl-PL', locale: 'pl-PL' },
  en: { code: 'en', name: 'English', flag: '🇬🇧', speech: 'en-US', locale: 'en-GB' },
  es: { code: 'es', name: 'Español', flag: '🇪🇸', speech: 'es-ES', locale: 'es-ES' },
  de: { code: 'de', name: 'Deutsch', flag: '🇩🇪', speech: 'de-DE', locale: 'de-DE' },
  fr: { code: 'fr', name: 'Français', flag: '🇫🇷', speech: 'fr-FR', locale: 'fr-FR' },
  ru: { code: 'ru', name: 'Русский', flag: '🇷🇺', speech: 'ru-RU', locale: 'ru-RU' },
} as const;

export type UiLanguageCode = keyof typeof UI_LANGUAGES;
export type UiLanguage = (typeof UI_LANGUAGES)[UiLanguageCode];

/** Words saved before the app language could be changed have Polish translations. */
export const LEGACY_NATIVE_LANGUAGE: UiLanguageCode = 'pl';
const FALLBACK_UI_LANGUAGE: UiLanguageCode = 'en';

const TRANSLATIONS: Record<UiLanguageCode, Translations> = { pl, en, es, de, fr, ru };

export function getTranslations(code: UiLanguageCode) {
  return TRANSLATIONS[code];
}

export function isUiLanguageCode(value: unknown): value is UiLanguageCode {
  return typeof value === 'string' && value in UI_LANGUAGES;
}

/** The phone's language when the app supports it, otherwise English. */
export function deviceUiLanguage(): UiLanguageCode {
  try {
    // e.g. "pl-PL"; some phones report "pl_PL" or an upper-case language.
    const code = Intl.DateTimeFormat().resolvedOptions().locale.split(/[-_]/)[0].toLowerCase();
    return isUiLanguageCode(code) ? code : FALLBACK_UI_LANGUAGE;
  } catch {
    return FALLBACK_UI_LANGUAGE;
  }
}
