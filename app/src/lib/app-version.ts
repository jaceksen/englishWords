import { doc, getDoc } from '@react-native-firebase/firestore';
import Constants from 'expo-constants';

import { db } from '@/lib/firebase';

/** The app's Google Play page (no `hl`, so the store opens in the phone's language). */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.vocabsprint';

/** Version of the installed app (`version` in app.json). */
export function getInstalledAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/** Release date of this version (`extra.releaseDate` in app.json, "YYYY-MM-DD"), as a local date. */
export function getReleaseDate(): Date | null {
  const value = Constants.expoConfig?.extra?.releaseDate;
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/**
 * Latest released version from `settings/appversion.version`, set by hand in the Firestore console
 * after a new AAB goes live. `null` when the document or field is missing.
 */
export async function fetchLatestAppVersion(): Promise<string | null> {
  const snap = await getDoc(doc(db, 'settings', 'appversion'));
  const version = snap.data()?.version;
  return typeof version === 'string' && version.trim() ? version.trim() : null;
}

function parseVersion(v: string): number[] | null {
  const parts = v.split('.').map((p) => Number(p));
  return parts.every((n) => Number.isInteger(n) && n >= 0) ? parts : null;
}

/**
 * Whether `remote` is higher than `local`, comparing segments as numbers (1.10.0 > 1.9.0);
 * missing segments count as 0. An invalid format gives false.
 */
export function isNewerVersion(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  if (!r || !l) return false;
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const diff = (r[i] ?? 0) - (l[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
