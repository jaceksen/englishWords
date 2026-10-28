import { Linking } from 'react-native';
import Purchases, {
  STORE_REPLACEMENT_MODE,
  type PurchasesError,
  type PurchasesPackage,
  type StoreProductChangeInfo,
} from 'react-native-purchases';

import { currentOffering, requireStoreUser } from '@/lib/revenuecat';
import type { PaidPlanCode } from '@/lib/plans';

const ANDROID_PACKAGE = 'com.vocabsprint';

/**
 * Google Play product ids; must match functions/src/revenuecat.ts. Subscription ids may come back as
 * "<subscriptionId>:<basePlanId>", so packages are matched by prefix.
 */
const PRODUCTS: Record<PaidPlanCode, string> = {
  pro_monthly: 'vocabsprint_pro_monthly',
  gold_monthly: 'vocabsprint_gold_monthly',
  pro_lifetime: 'vocabsprint_pro_lifetime',
};

function findPackage(packages: PurchasesPackage[], plan: PaidPlanCode) {
  return packages.find((p) => p.product.identifier.startsWith(PRODUCTS[plan])) ?? null;
}

/** Prices in the user's currency as Google Play will charge them; empty until the products are set up. */
export async function storePrices(): Promise<Partial<Record<PaidPlanCode, string>>> {
  const offering = await currentOffering();
  if (!offering) return {};
  const prices: Partial<Record<PaidPlanCode, string>> = {};
  for (const plan of Object.keys(PRODUCTS) as PaidPlanCode[]) {
    const pkg = findPackage(offering.availablePackages, plan);
    if (pkg) prices[plan] = pkg.product.priceString;
  }
  return prices;
}

/** Switching between Pro and Gold replaces the running Play subscription instead of adding a second one. */
async function subscriptionChange(plan: PaidPlanCode): Promise<StoreProductChangeInfo | null> {
  if (plan === 'pro_lifetime') return null;
  const info = await Purchases.getCustomerInfo();
  const running = info.activeSubscriptions.find((id) => id.startsWith('vocabsprint_') && !id.startsWith(PRODUCTS[plan]));
  return running
    ? { oldProductIdentifier: running.split(':')[0], replacementMode: STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION }
    : null;
}

/**
 * Opens Google Play's purchase sheet. Returns false when the user cancels. The plan itself is switched by
 * the RevenueCat webhook, and arrives through useSettings.
 */
export async function buyInStore(uid: string, plan: PaidPlanCode) {
  await requireStoreUser(uid);
  const offering = await currentOffering();
  const pkg = offering && findPackage(offering.availablePackages, plan);
  if (!pkg) throw new Error(`No Google Play product for ${plan}.`);
  try {
    await Purchases.purchasePackage(pkg, null, await subscriptionChange(plan));
    return true;
  } catch (e) {
    if ((e as PurchasesError).userCancelled) return false;
    throw e;
  }
}

/** Purchases made earlier on another phone or before reinstalling. */
export async function restoreStorePurchases(uid: string) {
  await requireStoreUser(uid);
  await Purchases.restorePurchases();
}

/** Cancelling and changing a Play subscription happens in Google Play. */
export function manageStoreSubscription() {
  return Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`);
}
