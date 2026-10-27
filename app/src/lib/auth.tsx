import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
  type User,
} from '@react-native-firebase/auth';
import { doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth, db } from '@/lib/firebase';

// OAuth client of type "web" (client_type 3) from google-services.json, required to get an idToken.
GoogleSignin.configure({
  webClientId: '954435657764-aiufv0dd7u2b9dbhjgu9u3peckaph5p7.apps.googleusercontent.com',
});

type AuthState = {
  user: User | null;
  initializing: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
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
    if (!idToken) throw new Error('Brak tokenu Google (sprawdź webClientId).');
    const { user: signedIn } = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    await setDoc(
      doc(db, 'users', signedIn.uid),
      { displayName: signedIn.displayName, email: signedIn.email, lastLoginAt: serverTimestamp() },
      { merge: true },
    );
  }

  async function signOut() {
    await GoogleSignin.signOut();
    await firebaseSignOut(auth);
  }

  return <AuthContext value={{ user, initializing, signIn, signOut }}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
