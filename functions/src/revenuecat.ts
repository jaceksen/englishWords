import './options.js';

import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

// Google Play purchases in the Android app go through RevenueCat (same setup as MotoTigo); the web portal keeps
// Stripe. RevenueCat calls this webhook after verifying a purchase; the app logs in to RevenueCat with the
// Firebase uid, so app_user_id is the uid.
//
// The store plan is kept apart from the Stripe one, in users/{uid}.store, so neither webhook can overwrite the
// other; the plan in effect is the higher of the two (functions/src/plan.ts, app and portal lib/settings).
const revenuecatApiKey = defineSecret('REVENUECAT_SECRET_API_KEY');
const revenuecatWebhookAuth = defineSecret('REVENUECAT_WEBHOOK_AUTH');

// Play product ids; must match app/src/lib/store-billing.ts. Entitlement "gold" ← gold monthly,
// "pro" ← pro monthly and pro lifetime (a one-time product).
const LIFETIME_PRODUCT = 'vocabsprint_pro_lifetime';

type RcEntitlement = { expires_date: string | null; product_identifier?: string };
type RcSubscriber = {
  entitlements?: Record<string, RcEntitlement>;
  non_subscriptions?: Record<string, unknown[]>;
};
type RcEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
};

/** Most ids looked up per event: the REST lookup creates an empty subscriber for an unknown id. */
const MAX_IDS_PER_EVENT = 10;

/**
 * Every signed-in user an event is about. PURCHASES_TRANSFER (a receipt moving to another account on the same
 * phone) has no app_user_id, only transferred_from/to; both sides need recomputing.
 */
function appUserIds(event: RcEvent) {
  const ids = new Set<string>();
  for (const id of [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ]) {
    if (typeof id === 'string' && id.trim() && !id.startsWith('$RCAnonymousID:')) ids.add(id.trim());
    if (ids.size >= MAX_IDS_PER_EVENT) break;
  }
  return [...ids];
}

async function fetchSubscriber(uid: string): Promise<RcSubscriber> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${revenuecatApiKey.value()}` },
  });
  if (!res.ok) throw new Error(`RevenueCat subscriber ${uid}: HTTP ${res.status}`);
  return ((await res.json()) as { subscriber: RcSubscriber }).subscriber;
}

const isActive = (e: RcEntitlement | undefined) =>
  !!e && (e.expires_date === null || new Date(e.expires_date).getTime() > Date.now());

/** Recomputes users/{uid}.store from RevenueCat's current state, so repeated or late events are harmless. */
async function syncStorePlan(uid: string) {
  const ref = getFirestore().doc(`users/${uid}`);
  // Never create a document for a deleted account (or an id that is not ours).
  if (!(await ref.get()).exists) return;
  const subscriber = await fetchSubscriber(uid);
  const { gold, pro } = subscriber.entitlements ?? {};
  const lifetime = (subscriber.non_subscriptions?.[LIFETIME_PRODUCT]?.length ?? 0) > 0;
  const active = isActive(gold) ? gold : isActive(pro) ? pro : undefined;
  const plan = isActive(gold) ? 'gold_monthly' : lifetime ? 'pro_lifetime' : isActive(pro) ? 'pro_monthly' : 'free';
  await ref.set(
    {
      store: {
        plan,
        lifetime,
        productId: active?.product_identifier ?? null,
        expiresAt: active?.expires_date ? Timestamp.fromDate(new Date(active.expires_date)) : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    // Replaces the whole map, so fields of an earlier product do not linger.
    { mergeFields: ['store'] },
  );
  console.log(`RevenueCat: users/${uid}.store.plan = ${plan}`);
}

export const revenuecatWebhook = onRequest({ secrets: [revenuecatApiKey, revenuecatWebhookAuth] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  // The Authorization header value is set in the RevenueCat dashboard.
  if (req.get('Authorization') !== revenuecatWebhookAuth.value()) {
    res.status(401).send('Unauthorized');
    return;
  }
  const event = (req.body?.event ?? {}) as RcEvent;
  const results = await Promise.allSettled(appUserIds(event).map(syncStorePlan));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    failed.forEach((f) => console.error(`RevenueCat ${event.type}: sync failed`, (f as PromiseRejectedResult).reason));
    // RevenueCat retries; syncing again is safe because the state is read from its API.
    res.status(502).send('Sync failed');
    return;
  }
  res.json({ received: true });
});
