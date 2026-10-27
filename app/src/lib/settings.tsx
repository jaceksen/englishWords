import { setLanguageCode } from '@react-native-firebase/auth';
import { doc, onSnapshot, setDoc } from '@react-native-firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  deviceUiLanguage,
  getTranslations,
  isUiLanguageCode,
  UI_LANGUAGES,
  type Translations,
  type UiLanguage,
  type UiLanguageCode,
} from '@/i18n';
import { useAuth } from '@/lib/auth';
import { auth, db } from '@/lib/firebase';
import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGES, type Language, type LanguageCode } from '@/lib/languages';
import { DEFAULT_PLAN, isPlanCode, PLANS, type Plan, type PlanCode } from '@/lib/plans';

type SettingsState = {
  /** Language being learned. */
  languageCode: LanguageCode;
  language: Language;
  setLanguage: (code: LanguageCode) => Promise<void>;
  /** Language the app talks to the user in (and their native language). */
  uiLanguageCode: UiLanguageCode;
  uiLanguage: UiLanguage;
  setUiLanguage: (code: UiLanguageCode) => Promise<void>;
  planCode: PlanCode;
  plan: Plan;
  t: Translations;
};

const SettingsContext = createContext<SettingsState | null>(null);

/**
 * User settings, stored in users/{uid}.settings so they follow the account across devices.
 * Before sign-in (and until the user picks one) the app language follows the phone.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [languageCode, setLanguageCodeState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [uiLanguageCode, setUiLanguageCode] = useState<UiLanguageCode>(deviceUiLanguage);
  const [planCode, setPlanCode] = useState<PlanCode>(DEFAULT_PLAN);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data();
      setPlanCode(isPlanCode(data?.plan) ? data.plan : DEFAULT_PLAN);
      const settings = data?.settings;
      setLanguageCodeState(isLanguageCode(settings?.language) ? settings.language : DEFAULT_LANGUAGE);
      if (isUiLanguageCode(settings?.uiLanguage)) setUiLanguageCode(settings.uiLanguage);
    });
  }, [user]);

  // Password reset and other Firebase emails follow the app language.
  useEffect(() => {
    setLanguageCode(auth, uiLanguageCode).catch(() => {});
  }, [uiLanguageCode]);

  function save(settings: Record<string, string>) {
    return user ? setDoc(doc(db, 'users', user.uid), { settings }, { merge: true }) : Promise.resolve();
  }

  async function setLanguage(code: LanguageCode) {
    setLanguageCodeState(code);
    await save({ language: code });
  }

  async function setUiLanguage(code: UiLanguageCode) {
    setUiLanguageCode(code);
    await save({ uiLanguage: code });
  }

  return (
    <SettingsContext
      value={{
        languageCode,
        language: LANGUAGES[languageCode],
        setLanguage,
        uiLanguageCode,
        uiLanguage: UI_LANGUAGES[uiLanguageCode],
        setUiLanguage,
        planCode,
        plan: PLANS[planCode],
        t: getTranslations(uiLanguageCode),
      }}>
      {children}
    </SettingsContext>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

/** Shortcut for components that only need texts. */
export function useT() {
  return useSettings().t;
}
