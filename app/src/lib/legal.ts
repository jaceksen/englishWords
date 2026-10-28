import * as WebBrowser from 'expo-web-browser';

import type { UiLanguageCode } from '@/i18n';

// The legal pages live on the web portal (englishWordsWWW, src/pages/legal.tsx); Google Play links there too.
const LEGAL_BASE_URL = 'https://vocabsprint.com';

export type LegalPage = 'terms' | 'privacy' | 'deleteAccount';

const PATHS: Record<LegalPage, string> = {
  terms: '/terms',
  privacy: '/privacy',
  deleteAccount: '/delete-account',
};

export function openLegalPage(page: LegalPage, lang: UiLanguageCode) {
  return WebBrowser.openBrowserAsync(`${LEGAL_BASE_URL}${PATHS[page]}?lang=${lang}`);
}
