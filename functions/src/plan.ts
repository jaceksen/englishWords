import { getFirestore } from 'firebase-admin/firestore';

// Must match PLAN_RANK in app/src/lib/plans.ts.
const PLAN_RANK: Record<string, number> = { free: 0, pro_monthly: 1, pro_lifetime: 1, gold_monthly: 2 };

// Values the admin may type in freeplans/{email}.plan.
const GRANT_PLANS: Record<string, string> = {
  pro: 'pro_monthly',
  gold: 'gold_monthly',
  pro_monthly: 'pro_monthly',
  gold_monthly: 'gold_monthly',
};

/**
 * A valid free plan from freeplans/{email in lowercase}, created by the admin in the Firebase console with
 * `plan` and `validUntil` ("YYYY-MM-DD", valid to the end of that day, UTC). Anything malformed, expired or
 * unreadable is ignored, so a grant can never break the paid path.
 */
async function freePlanGrant(email: string | undefined) {
  if (!email) return null;
  try {
    const snap = await getFirestore().doc(`freeplans/${email.trim().toLowerCase()}`).get();
    const plan = snap.get('plan');
    const validUntil = snap.get('validUntil');
    const code = typeof plan === 'string' ? GRANT_PLANS[plan.trim().toLowerCase()] : undefined;
    if (!code || typeof validUntil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil.trim())) return null;
    return new Date().toISOString().slice(0, 10) <= validUntil.trim() ? code : null;
  } catch {
    return null;
  }
}

const higher = (a: string, b: string | null | undefined) => (b && (PLAN_RANK[b] ?? 0) > (PLAN_RANK[a] ?? 0) ? b : a);

/**
 * The plan in effect: the highest of the one bought through Stripe (users/{uid}.plan), through Google Play
 * (users/{uid}.store.plan, functions/src/revenuecat.ts) and a valid admin grant.
 */
export async function effectivePlan(uid: string, email: string | undefined) {
  const [user, granted] = await Promise.all([getFirestore().doc(`users/${uid}`).get(), freePlanGrant(email)]);
  const purchased = (user.get('plan') as string | undefined) ?? 'free';
  return higher(higher(purchased, user.get('store.plan') as string | undefined), granted);
}
