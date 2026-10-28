import { httpsCallable } from '@react-native-firebase/functions';

import { functions } from '@/lib/firebase';

const deleteAccountCallable = httpsCallable<void, { deleted: boolean }>(functions, 'deleteAccount');

/**
 * Deletes the account with all words (functions/src/account.ts) and stops a Stripe subscription.
 * The Auth user is gone afterwards, so the caller signs out.
 */
export async function deleteAccount() {
  await deleteAccountCallable();
}
