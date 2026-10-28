import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from '@react-native-firebase/auth';
import { doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Translations } from '@/i18n';
import { auth, db } from '@/lib/firebase';
import { syncStoreUser } from '@/lib/revenuecat';

// OAuth client of type "web" (client_type 3) from google-services.json, required to get an idToken.
GoogleSignin.configure({
  webClientId: '954435657764-aiufv0dd7u2b9dbhjgu9u3peckaph5p7.apps.googleusercontent.com',
});

type AuthState = {
  user: User | null;
  initializing: boolean;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

/** Thrown when Google returns no ID token; shown via `t.authErrors.noGoogleToken`. */
class NoGoogleTokenError extends Error {
  code = 'noGoogleToken';
}

/** Message in the app language for a Firebase Auth error, falling back to the original message. */
export function authErrorMessage(error: unknown, t: Translations) {
  const code = String((error as { code?: string } | null)?.code ?? '').replace(/^auth\//, '');
  // Older SDKs report a wrong password or unknown user separately; both mean the same to the user.
  const key = code === 'wrong-password' || code === 'user-not-found' ? 'invalid-credential' : code;
  if (key in t.authErrors) return t.authErrors[key as keyof Translations['authErrors']];
  return error instanceof Error ? error.message : String(error);
}

function saveProfile(user: User) {
  return setDoc(
    doc(db, 'users', user.uid),
    { displayName: user.displayName, email: user.email, lastLoginAt: serverTimestamp() },
    { merge: true },
  );
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        // Google Play purchases must be credited to the signed-in account.
        void syncStoreUser(nextUser?.uid ?? null);
        setUser(nextUser);
        setInitializing(false);
      }),
    [],
  );

  async function signIn() {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return; // cancelled by the user
    const { idToken } = response.data;
    if (!idToken) throw new NoGoogleTokenError('Google returned no idToken (check webClientId).');
    const { user: signedIn } = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    await saveProfile(signedIn);
  }

  async function signInWithEmail(email: string, password: string) {
    const { user: signedIn } = await signInWithEmailAndPassword(auth, email.trim(), password);
    await saveProfile(signedIn);
  }

  async function signUpWithEmail(email: string, password: string) {
    const { user: created } = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await saveProfile(created);
  }

  function resetPassword(email: string) {
    return sendPasswordResetEmail(auth, email.trim());
  }

  async function signOut() {
    // Users who signed in with email have no Google session to end.
    await GoogleSignin.signOut().catch(() => {});
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext value={{ user, initializing, signIn, signInWithEmail, signUpWithEmail, resetPassword, signOut }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
