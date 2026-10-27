export const FREE_WORD_LIMIT = 10;

/**
 * Subscription plans, stored as users/{uid}.plan and switched by the Stripe webhook after a payment.
 * `wordLimit` counts words in all learning languages; null means unlimited. `naturalVoices` speaks with
 * Google Cloud voices instead of the phone's own.
 */
export const PLANS = {
  free: { code: 'free', icon: '🌱', wordLimit: FREE_WORD_LIMIT, naturalVoices: false },
  pro_monthly: { code: 'pro_monthly', icon: '⭐', wordLimit: null, naturalVoices: false },
  gold_monthly: { code: 'gold_monthly', icon: '🥇', wordLimit: null, naturalVoices: true },
  pro_lifetime: { code: 'pro_lifetime', icon: '♾️', wordLimit: null, naturalVoices: false },
} as const;

export type PlanCode = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanCode];
export type PaidPlanCode = Exclude<PlanCode, 'free'>;

export const DEFAULT_PLAN: PlanCode = 'free';

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && value in PLANS;
}

/** Higher wins when a purchased plan and an admin grant meet. Must match PLAN_RANK in functions/src/plan.ts. */
const PLAN_RANK: Record<PlanCode, number> = { free: 0, pro_monthly: 1, pro_lifetime: 1, gold_monthly: 2 };

export function higherPlan(a: PlanCode, b: PlanCode) {
  return PLAN_RANK[b] > PLAN_RANK[a] ? b : a;
}

/**
 * A plan given for free by the admin: freeplans/{email in lowercase}, created by hand in the Firebase
 * console with `plan` ("pro" or "gold") and `validUntil` ("YYYY-MM-DD", valid to the end of that day);
 * other fields such as `note` are for the admin only. Same convention as in MotoTigo.
 */
export type PlanGrant = { plan: PlanCode; validUntil: Date };

const GRANT_PLANS: Record<string, PlanCode> = {
  pro: 'pro_monthly',
  gold: 'gold_monthly',
  pro_monthly: 'pro_monthly',
  gold_monthly: 'gold_monthly',
};

/** The grant if it is well-formed and not expired; anything else is ignored. */
export function parsePlanGrant(data: { plan?: unknown; validUntil?: unknown } | undefined): PlanGrant | null {
  const plan = typeof data?.plan === 'string' ? GRANT_PLANS[data.plan.trim().toLowerCase()] : undefined;
  const date = typeof data?.validUntil === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.validUntil.trim());
  if (!plan || !date) return null;
  const validUntil = new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), 23, 59, 59, 999);
  return validUntil.getTime() >= Date.now() ? { plan, validUntil } : null;
}

/** Must match the currency options of the Stripe prices (and CURRENCIES in functions/src/billing.ts). */
export const PRICES: Record<PaidPlanCode, Record<Currency, number>> = {
  pro_monthly: { usd: 3, pln: 11.99, eur: 2.99 },
  gold_monthly: { usd: 6, pln: 23.99, eur: 5.99 },
  pro_lifetime: { usd: 50, pln: 199, eur: 49 },
};

export type Currency = 'usd' | 'pln' | 'eur';

const EURO_COUNTRIES = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI',
  'SK', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK',
]);

/** Currency for the phone's region (e.g. pl-PL → PLN); dollars outside Poland and the euro area. */
export function deviceCurrency(): Currency {
  try {
    // e.g. "pl-PL" or "sr-Latn-ME"; Hermes has no Intl.Locale, so read the region subtag directly.
    const [language, ...subtags] = Intl.DateTimeFormat().resolvedOptions().locale.split(/[-_]/);
    // Some phones report only a language; assume its main country then.
    const region =
      subtags.find((tag) => /^[A-Z]{2}$/.test(tag)) ??
      ({ pl: 'PL', de: 'DE', fr: 'FR', es: 'ES' } as Record<string, string>)[language];
    if (region === 'PL') return 'pln';
    if (region && EURO_COUNTRIES.has(region)) return 'eur';
  } catch {
    // Fall through to dollars.
  }
  return 'usd';
}

export function formatPrice(plan: PaidPlanCode, currency: Currency, locale: string) {
  const amount = PRICES[plan][currency];
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}
