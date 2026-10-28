import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type PurchasesOffering } from 'react-native-purchases';

// Google Play purchases go through RevenueCat (as in MotoTigo); its webhook (functions/src/revenuecat.ts) sets
// users/{uid}.store, and the app sees the new plan through useSettings. The app user id is the Firebase uid.
// Without the public SDK key (development builds, web) everything here does nothing.
const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

export const storeBillingEnabled = Platform.OS === 'android' && API_KEY.length > 0;

let configured = false;

function configure() {
  if (configured || !storeBillingEnabled) return configured;
  if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
  return true;
}

// Sign-in and sign-out arrive one after another when the user changes; run them in order so RevenueCat never
// ends up on the previous user (a purchase would then go to their account).
let identity: Promise<void> = Promise.resolve();

function queue(task: () => Promise<void>) {
  identity = identity.then(task, task);
  return identity;
}

/** Follows the signed-in Firebase user; called from AuthProvider. */
export function syncStoreUser(uid: string | null) {
  return queue(async () => {
    if (!configure()) return;
    try {
      if (uid) await Purchases.logIn(uid);
      else if (!(await Purchases.isAnonymous())) await Purchases.logOut();
    } catch (e) {
      console.warn('RevenueCat: identity change failed', e);
    }
  });
}

/** Makes sure a purchase is credited to this user; throws rather than sell to the wrong account. */
export async function requireStoreUser(uid: string) {
  if (!configure()) throw new Error('Store billing is not available.');
  await identity.catch(() => undefined);
  if ((await Purchases.getAppUserID()) !== uid) await Purchases.logIn(uid);
  if ((await Purchases.getAppUserID()) !== uid) throw new Error('RevenueCat user mismatch.');
}

export async function currentOffering(): Promise<PurchasesOffering | null> {
  if (!configure()) return null;
  try {
    return (await Purchases.getOfferings()).current ?? null;
  } catch {
    return null;
  }
}
