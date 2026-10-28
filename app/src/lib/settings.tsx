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
import { DEFAULT_LEVEL, isLevel, type Level } from '@/lib/levels';
import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGES, type Language, type LanguageCode } from '@/lib/languages';
import {
  DEFAULT_PLAN,
  higherPlan,
  isPlanCode,
  parsePlanGrant,
  PLANS,
  type Plan,
  type PlanCode,
  type PlanGrant,
} from '@/lib/plans';
import { setNaturalVoices } from '@/lib/speech';

type SettingsState = {
  /** Language being learned. */
  languageCode: LanguageCode;
  language: Language;
  setLanguage: (code: LanguageCode) => Promise<void>;
  /** Language the app talks to the user in (and their native language). */
  uiLanguageCode: UiLanguageCode;
  uiLanguage: UiLanguage;
  setUiLanguage: (code: UiLanguageCode) => Promise<void>;
  /** The learner's CEFR level, for choosing words to import from photos and texts. */
  level: Level;
  setLevel: (level: Level) => Promise<void>;
  /** The plan in effect: the highest of the Stripe one, the Google Play one and an admin grant. */
  planCode: PlanCode;
  plan: Plan;
  /** Bought through Stripe; what payments and the subscription portal are about. */
  purchasedPlanCode: PlanCode;
  /** Bought in the Android app through Google Play (users/{uid}.store); managed in Google Play. */
  storePlanCode: PlanCode;
  /** Plan given for free by the admin (freeplans/{email}), while valid. */
  planGrant: PlanGrant | null;
  /** Lifetime Pro was bought; it stays under a Gold subscription and comes back when that ends. */
  hasLifetime: boolean;
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
  const [level, setLevelState] = useState<Level>(DEFAULT_LEVEL);
  const [purchasedPlanCode, setPurchasedPlanCode] = useState<PlanCode>(DEFAULT_PLAN);
  const [storePlanCode, setStorePlanCode] = useState<PlanCode>(DEFAULT_PLAN);
  const [lifetimeBought, setLifetimeBought] = useState(false);
  const [planGrant, setPlanGrant] = useState<PlanGrant | null>(null);
  const planCode = higherPlan(higherPlan(purchasedPlanCode, storePlanCode), planGrant?.plan ?? DEFAULT_PLAN);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data();
      setPurchasedPlanCode(isPlanCode(data?.plan) ? data.plan : DEFAULT_PLAN);
      setStorePlanCode(isPlanCode(data?.store?.plan) ? data.store.plan : DEFAULT_PLAN);
      setLifetimeBought(data?.stripe?.lifetime === true || data?.store?.lifetime === true);
      const settings = data?.settings;
      setLanguageCodeState(isLanguageCode(settings?.language) ? settings.language : DEFAULT_LANGUAGE);
      if (isUiLanguageCode(settings?.uiLanguage)) setUiLanguageCode(settings.uiLanguage);
      setLevelState(isLevel(settings?.level) ? settings.level : DEFAULT_LEVEL);
    });
  }, [user]);

  // Admin grants are keyed by e-mail; a read error must not break the purchased plan.
  useEffect(() => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) return;
    return onSnapshot(
      doc(db, 'freeplans', email),
      (snap) => setPlanGrant(parsePlanGrant(snap.data())),
      () => setPlanGrant(null),
    );
  }, [user]);

  useEffect(() => {
    setNaturalVoices(PLANS[planCode].naturalVoices);
  }, [planCode]);

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

  async function setLevel(value: Level) {
    setLevelState(value);
    await save({ level: value });
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
        level,
        setLevel,
        planCode,
        plan: PLANS[planCode],
        purchasedPlanCode,
        storePlanCode,
        planGrant,
        hasLifetime: lifetimeBought || purchasedPlanCode === 'pro_lifetime',
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
