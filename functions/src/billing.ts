import './options.js';

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';

initializeApp();

export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
// Stripe ids (price_…, bpc_…), kept in functions/.env.
const monthlyPrice = defineString('STRIPE_PRICE_MONTHLY');
const lifetimePrice = defineString('STRIPE_PRICE_LIFETIME');
const goldPrice = defineString('STRIPE_PRICE_GOLD');
const portalConfiguration = defineString('STRIPE_PORTAL_CONFIGURATION');

// The Stripe account is shared with other apps; their webhook events carry a different `app`.
const APP = 'vocabsprint';

// Must match app/src/lib/plans.ts.
type PlanCode = 'free' | 'pro_monthly' | 'gold_monthly' | 'pro_lifetime';
type SubscriptionPlan = 'pro_monthly' | 'gold_monthly';
const SUBSCRIPTION_PLANS: string[] = ['pro_monthly', 'gold_monthly'] satisfies SubscriptionPlan[];

const PRICES = {
  pro_monthly: monthlyPrice,
  gold_monthly: goldPrice,
  pro_lifetime: lifetimePrice,
};

/** Subscriptions created before Gold existed have no plan in their metadata; they are Pro. */
function subscriptionPlan(metadata: Stripe.Metadata | null | undefined): SubscriptionPlan {
  return metadata?.plan === 'gold_monthly' ? 'gold_monthly' : 'pro_monthly';
}

/** Lifetime Pro stays when a subscription on top of it (Gold) ends. */
function hasLifetime(user: FirebaseFirestore.DocumentSnapshot) {
  return user.get('stripe.lifetime') === true || user.get('plan') === 'pro_lifetime';
}
// Currency options set on both Stripe prices; the app shows the price in the one it sends.
const CURRENCIES = ['usd', 'pln', 'eur'];

// Where Stripe sends the browser back. The page hands over to the app through its URL scheme, or to the web
// portal (englishWordsWWW, Firebase Hosting site vocabsprint-app; localhost:5173 while developing it).
const RETURN_PAGE = 'https://europe-central2-legalizacjaonline.cloudfunctions.net/billingReturn';
const APP_RETURN_URL =
  /^(?:(?:englishwords|exp\+english-words):\/\/|https:\/\/(?:vocabsprint-app\.(?:web\.app|firebaseapp\.com)|(?:www\.)?vocabsprint\.com)\/|http:\/\/localhost:5173\/)/;

let stripe: Stripe | undefined;
export function getStripe() {
  stripe ??= new Stripe(stripeSecretKey.value());
  return stripe;
}

const db = () => getFirestore();

function requireUid(auth: { uid: string } | undefined) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  return auth.uid;
}

function requireReturnUrl(value: unknown) {
  if (typeof value !== 'string' || !APP_RETURN_URL.test(value)) {
    throw new HttpsError('invalid-argument', 'Invalid return URL.');
  }
  return value;
}

function returnPage(appUrl: string, status: string) {
  return `${RETURN_PAGE}?status=${status}&to=${encodeURIComponent(appUrl)}`;
}

/** One Stripe customer per user, so subscriptions and receipts stay together. */
async function customerFor(uid: string, email: string | undefined) {
  const ref = db().doc(`users/${uid}`);
  const existing = (await ref.get()).get('stripe.customerId');
  if (typeof existing === 'string') return existing;
  const customer = await getStripe().customers.create({ email, metadata: { app: APP, uid } });
  await ref.set({ stripe: { customerId: customer.id } }, { merge: true });
  return customer.id;
}

async function setPlan(uid: string, plan: PlanCode, stripeFields: Record<string, unknown> = {}) {
  await db()
    .doc(`users/${uid}`)
    .set({ plan, planUpdatedAt: FieldValue.serverTimestamp(), stripe: stripeFields }, { merge: true });
}

// --- createCheckoutSession -----------------------------------------------------

export const createCheckoutSession = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  const uid = requireUid(request.auth);
  const plan: unknown = request.data?.plan;
  if (plan !== 'pro_monthly' && plan !== 'gold_monthly' && plan !== 'pro_lifetime') {
    throw new HttpsError('invalid-argument', 'Unknown plan.');
  }
  const appUrl = requireReturnUrl(request.data?.returnUrl);
  // Older app versions did not send a currency; they showed dollars.
  const currency = CURRENCIES.includes(request.data?.currency) ? (request.data.currency as string) : 'usd';
  const user = await db().doc(`users/${uid}`).get();
  const lifetime = hasLifetime(user);
  if (user.get('plan') === plan || (plan === 'pro_lifetime' && lifetime)) {
    throw new HttpsError('already-exists', 'This plan is already active.');
  }
  if (plan === 'pro_monthly' && lifetime) {
    throw new HttpsError('failed-precondition', 'Lifetime already includes Pro.');
  }

  const customer = await customerFor(uid, request.auth?.token.email);
  const monthly = SUBSCRIPTION_PLANS.includes(plan);
  const session = await getStripe().checkout.sessions.create({
    mode: monthly ? 'subscription' : 'payment',
    currency,
    customer,
    client_reference_id: uid,
    line_items: [{ price: PRICES[plan].value(), quantity: 1 }],
    metadata: { app: APP, uid, plan },
    ...(monthly
      ? { subscription_data: { metadata: { app: APP, uid, plan } } }
      : { invoice_creation: { enabled: true, invoice_data: { metadata: { app: APP, uid } } } }),
    allow_promotion_codes: true,
    success_url: returnPage(appUrl, 'success'),
    cancel_url: returnPage(appUrl, 'cancel'),
  });
  if (!session.url) throw new HttpsError('internal', 'Stripe did not return a checkout URL.');
  return { url: session.url };
});

// --- createPortalSession -------------------------------------------------------

/** Stripe's own page for cancelling the subscription, changing the card and downloading invoices. */
export const createPortalSession = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  const uid = requireUid(request.auth);
  const appUrl = requireReturnUrl(request.data?.returnUrl);
  const customer = (await db().doc(`users/${uid}`).get()).get('stripe.customerId');
  if (typeof customer !== 'string') throw new HttpsError('failed-precondition', 'No purchases yet.');
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    configuration: portalConfiguration.value(),
    return_url: returnPage(appUrl, 'portal'),
  });
  return { url: session.url };
});

// --- billingReturn -------------------------------------------------------------

export const billingReturn = onRequest((req, res) => {
  const to = typeof req.query.to === 'string' && APP_RETURN_URL.test(req.query.to) ? req.query.to : 'englishwords://';
  const status = String(req.query.status ?? '').replace(/[^a-z]/g, '');
  const target = `${to}${to.includes('?') ? '&' : '?'}status=${status}`;
  const href = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  res.set('Cache-Control', 'no-store').send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
      `<meta http-equiv="refresh" content="0;url=${href}">` +
      `<body style="font-family:sans-serif;text-align:center;padding:48px 16px">` +
      `<p>VocabSprint</p><p><a href="${href}">Return to the app</a></p></body>`,
  );
});

// --- stripeWebhook -------------------------------------------------------------

const ACTIVE_STATUSES: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due'];

async function cancelSubscription(id: unknown) {
  if (typeof id !== 'string') return;
  await getStripe()
    .subscriptions.cancel(id)
    .catch((e) => console.warn('Could not cancel subscription', id, e));
}

export const stripeWebhook = onRequest({ secrets: [stripeSecretKey, stripeWebhookSecret] }, async (req, res) => {
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.rawBody,
      req.get('stripe-signature') ?? '',
      stripeWebhookSecret.value(),
    );
  } catch (error) {
    console.warn('Invalid Stripe webhook signature', error);
    res.status(400).send('Invalid signature');
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const uid = session.metadata?.uid;
      if (session.metadata?.app !== APP || !uid || session.payment_status !== 'paid') break;
      const user = await db().doc(`users/${uid}`).get();
      const previousSubscription = user.get('stripe.subscriptionId');

      if (session.mode === 'payment') {
        // Lifetime Pro. A Gold subscription keeps running on top of it (it adds the voices); a Pro
        // subscription is now redundant, so stop charging for it.
        const gold = user.get('plan') === 'gold_monthly';
        await setPlan(uid, gold ? 'gold_monthly' : 'pro_lifetime', {
          lifetime: true,
          lifetimePaymentId: session.payment_intent,
        });
        if (!gold) await cancelSubscription(previousSubscription);
      } else if (session.mode === 'subscription') {
        const plan = subscriptionPlan(session.metadata);
        await setPlan(uid, plan, { subscriptionId: session.subscription, subscriptionPlan: plan });
        // Switching between Pro and Gold: the new subscription replaces the old one.
        if (previousSubscription !== session.subscription) await cancelSubscription(previousSubscription);
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const uid = subscription.metadata?.uid;
      if (subscription.metadata?.app !== APP || !uid) break;
      const user = await db().doc(`users/${uid}`).get();
      // The account was deleted (deleteAccount cancels its subscriptions); do not recreate it.
      if (!user.exists) break;
      // Events of a subscription that was replaced by a newer one.
      if (user.get('stripe.subscriptionId') && user.get('stripe.subscriptionId') !== subscription.id) break;
      const active = event.type === 'customer.subscription.updated' && ACTIVE_STATUSES.includes(subscription.status);
      const plan = subscriptionPlan(subscription.metadata);
      await setPlan(uid, active ? plan : hasLifetime(user) ? 'pro_lifetime' : 'free', {
        subscriptionId: subscription.id,
        subscriptionPlan: plan,
      });
      break;
    }
  }
  res.json({ received: true });
});
