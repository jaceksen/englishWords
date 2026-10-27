import './options.js';

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';

initializeApp();

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
// Stripe ids (price_…, bpc_…), kept in functions/.env.
const monthlyPrice = defineString('STRIPE_PRICE_MONTHLY');
const lifetimePrice = defineString('STRIPE_PRICE_LIFETIME');
const portalConfiguration = defineString('STRIPE_PORTAL_CONFIGURATION');

// The Stripe account is shared with other apps; their webhook events carry a different `app`.
const APP = 'vocabsprint';

// Must match app/src/lib/plans.ts.
type PlanCode = 'free' | 'pro_monthly' | 'pro_lifetime';
// Currency options set on both Stripe prices; the app shows the price in the one it sends.
const CURRENCIES = ['usd', 'pln', 'eur'];

// Where Stripe sends the browser back. The page hands over to the app through its URL scheme.
const RETURN_PAGE = 'https://europe-central2-legalizacjaonline.cloudfunctions.net/billingReturn';
const APP_RETURN_URL = /^(englishwords|exp\+english-words):\/\//;

let stripe: Stripe | undefined;
function getStripe() {
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
  const plan = request.data?.plan;
  if (plan !== 'pro_monthly' && plan !== 'pro_lifetime') {
    throw new HttpsError('invalid-argument', 'Unknown plan.');
  }
  const appUrl = requireReturnUrl(request.data?.returnUrl);
  // Older app versions did not send a currency; they showed dollars.
  const currency = CURRENCIES.includes(request.data?.currency) ? (request.data.currency as string) : 'usd';
  const current = (await db().doc(`users/${uid}`).get()).get('plan');
  if (current === 'pro_lifetime' || current === plan) {
    throw new HttpsError('already-exists', 'This plan is already active.');
  }

  const customer = await customerFor(uid, request.auth?.token.email);
  const monthly = plan === 'pro_monthly';
  const session = await getStripe().checkout.sessions.create({
    mode: monthly ? 'subscription' : 'payment',
    currency,
    customer,
    client_reference_id: uid,
    line_items: [{ price: monthly ? monthlyPrice.value() : lifetimePrice.value(), quantity: 1 }],
    metadata: { app: APP, uid, plan },
    ...(monthly
      ? { subscription_data: { metadata: { app: APP, uid } } }
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
      if (session.mode === 'payment') {
        await setPlan(uid, 'pro_lifetime', { lifetimePaymentId: session.payment_intent });
        // Lifetime replaces a running monthly subscription, so stop charging for it.
        const subscriptionId = (await db().doc(`users/${uid}`).get()).get('stripe.subscriptionId');
        if (typeof subscriptionId === 'string') {
          await getStripe()
            .subscriptions.cancel(subscriptionId)
            .catch((e) => console.warn('Could not cancel subscription', subscriptionId, e));
        }
      } else if (session.mode === 'subscription') {
        await setPlan(uid, 'pro_monthly', { subscriptionId: session.subscription });
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const uid = subscription.metadata?.uid;
      if (subscription.metadata?.app !== APP || !uid) break;
      const ref = db().doc(`users/${uid}`);
      const user = await ref.get();
      // A lifetime purchase is never taken back by a subscription ending.
      if (user.get('plan') === 'pro_lifetime') break;
      if (user.get('stripe.subscriptionId') && user.get('stripe.subscriptionId') !== subscription.id) break;
      const active = event.type === 'customer.subscription.updated' && ACTIVE_STATUSES.includes(subscription.status);
      await setPlan(uid, active ? 'pro_monthly' : 'free', { subscriptionId: subscription.id });
      break;
    }
  }
  res.json({ received: true });
});
