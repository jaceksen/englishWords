import { httpsCallable } from '@react-native-firebase/functions';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { functions } from '@/lib/firebase';
import type { PlanCode } from '@/lib/plans';

// Shapes mirror functions/src/billing.ts.
type CheckoutRequest = { plan: Exclude<PlanCode, 'free'>; returnUrl: string };
type PortalRequest = { returnUrl: string };

const createCheckoutSession = httpsCallable<CheckoutRequest, { url: string }>(functions, 'createCheckoutSession');
const createPortalSession = httpsCallable<PortalRequest, { url: string }>(functions, 'createPortalSession');

/** Stripe pages return here; see app/billing.tsx. */
const returnUrl = () => Linking.createURL('billing');

/**
 * Opens Stripe Checkout. The plan itself is switched by the Stripe webhook, and the app picks it up from
 * users/{uid} a moment after the payment, so there is nothing to apply here.
 */
export async function buyPlan(plan: Exclude<PlanCode, 'free'>) {
  const { data } = await createCheckoutSession({ plan, returnUrl: returnUrl() });
  await WebBrowser.openAuthSessionAsync(data.url, returnUrl());
}

/** Stripe's customer portal: cancel the subscription, change the card, download invoices. */
export async function manageBilling() {
  const { data } = await createPortalSession({ returnUrl: returnUrl() });
  await WebBrowser.openAuthSessionAsync(data.url, returnUrl());
}
