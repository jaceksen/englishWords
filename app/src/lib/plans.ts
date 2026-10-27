export const FREE_WORD_LIMIT = 10;

/**
 * Subscription plans, stored as users/{uid}.plan and switched by the Stripe webhook after a payment.
 * `wordLimit` counts words in all learning languages; null means unlimited.
 */
export const PLANS = {
  free: { code: 'free', icon: '🌱', wordLimit: FREE_WORD_LIMIT },
  pro_monthly: { code: 'pro_monthly', icon: '⭐', wordLimit: null },
  pro_lifetime: { code: 'pro_lifetime', icon: '💎', wordLimit: null },
} as const;

export type PlanCode = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanCode];
export type PaidPlanCode = Exclude<PlanCode, 'free'>;

export const DEFAULT_PLAN: PlanCode = 'free';

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && value in PLANS;
}

/** Must match the currency options of the Stripe prices (and CURRENCIES in functions/src/billing.ts). */
export const PRICES: Record<PaidPlanCode, Record<Currency, number>> = {
  pro_monthly: { usd: 3, pln: 11.99, eur: 2.99 },
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
