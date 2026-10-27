import { doc, onSnapshot, setDoc } from '@react-native-firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGES, type LanguageCode } from '@/lib/languages';

type SettingsState = {
  languageCode: LanguageCode;
  language: (typeof LANGUAGES)[LanguageCode];
  setLanguage: (code: LanguageCode) => Promise<void>;
};

const SettingsContext = createContext<SettingsState | null>(null);

/** User settings, stored in users/{uid}.settings so they follow the account across devices. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [languageCode, setLanguageCode] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const stored = snap.data()?.settings?.language;
      setLanguageCode(isLanguageCode(stored) ? stored : DEFAULT_LANGUAGE);
    });
  }, [user]);

  async function setLanguage(code: LanguageCode) {
    setLanguageCode(code);
    if (user) await setDoc(doc(db, 'users', user.uid), { settings: { language: code } }, { merge: true });
  }

  return (
    <SettingsContext value={{ languageCode, language: LANGUAGES[languageCode], setLanguage }}>
      {children}
    </SettingsContext>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
