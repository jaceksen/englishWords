import './options.js';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';

import { getStripe, stripeSecretKey } from './billing.js';
import { requireAuth } from './claude.js';

// --- deleteAccount ---------------------------------------------------------------

/**
 * Deletes the signed-in user's account: stops Stripe subscriptions, removes their words and settings, and the
 * Firebase Auth user. Required by Google Play (in-app account deletion). Payment records stay in Stripe.
 */
export const deleteAccount = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  requireAuth(request);
  const { uid } = request.auth;
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);

  const customer = (await userRef.get()).get('stripe.customerId');
  if (typeof customer === 'string') {
    const subscriptions = await getStripe().subscriptions.list({ customer, status: 'all' });
    await Promise.all(
      subscriptions.data
        .filter((s) => !['canceled', 'incomplete_expired'].includes(s.status))
        .map((s) => getStripe().subscriptions.cancel(s.id)),
    );
  }

  await db.recursiveDelete(userRef);
  await db.doc(`importUsage/${uid}`).delete();
  await getAuth().deleteUser(uid);
  return { deleted: true };
});
