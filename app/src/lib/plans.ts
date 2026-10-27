export const FREE_WORD_LIMIT = 10;

/**
 * Subscription plans, stored as users/{uid}.plan. Until payments are connected the user picks one in Settings.
 * `wordLimit` counts words in all learning languages; null means unlimited.
 */
export const PLANS = {
  free: { code: 'free', icon: '🌱', price: null, wordLimit: FREE_WORD_LIMIT },
  pro_monthly: { code: 'pro_monthly', icon: '⭐', price: '$3', wordLimit: null },
  pro_lifetime: { code: 'pro_lifetime', icon: '💎', price: '$50', wordLimit: null },
} as const;

export type PlanCode = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanCode];

export const DEFAULT_PLAN: PlanCode = 'free';

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && value in PLANS;
}
