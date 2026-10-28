import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { UI_LANGUAGES, type UiLanguageCode } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { buyPlan, manageBilling } from '@/lib/billing';
import { LANGUAGES, type LanguageCode } from '@/lib/languages';
import { LEVELS } from '@/lib/levels';
import { deviceCurrency, formatPrice, PLANS, type PlanCode } from '@/lib/plans';
import { useSettings } from '@/lib/settings';
import { countWords } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-settings.jpg');

type Option<T extends string> = { value: T; flag: string; label: string; detail?: string };

function OptionPicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={() => onChange(option.value)}
        style={[
          styles.option,
          { backgroundColor: theme.backgroundElement, borderColor: selected ? theme.primary : 'transparent' },
        ]}>
        <ThemedText style={styles.flag}>{option.flag}</ThemedText>
        <View style={styles.optionLabel}>
          <ThemedText>{option.label}</ThemedText>
          {!!option.detail && (
            <ThemedText type="small" themeColor="textSecondary">
              {option.detail}
            </ThemedText>
          )}
        </View>
        {selected && <ThemedText themeColor="primary">✓</ThemedText>}
      </Pressable>
    );
  });
}

/** Section heading, in the blue of the constellations on the settings background. */
function SectionTitle({ children }: { children: string }) {
  return (
    <ThemedText accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </ThemedText>
  );
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const {
    t,
    languageCode,
    setLanguage,
    uiLanguage,
    uiLanguageCode,
    setUiLanguage,
    level,
    setLevel,
    planCode,
    plan,
    purchasedPlanCode,
    planGrant,
    hasLifetime,
  } = useSettings();
  // The same currency is shown here and charged by Stripe.
  const [currency] = useState(deviceCurrency);
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    countWords(user.uid)
      .then(setWordCount)
      .catch(() => setWordCount(null));
  }, [user]);

  // Plans change only after Stripe confirms a payment; the new plan then arrives through useSettings.
  async function runBilling(action: () => Promise<void>) {
    setBillingBusy(true);
    setBillingError(null);
    try {
      await action();
    } catch {
      setBillingError(t.plans.billingError);
    } finally {
      setBillingBusy(false);
    }
  }

  function choosePlan(code: PlanCode) {
    if (billingBusy || code === planCode) return;
    // Lifetime already covers monthly Pro.
    if (hasLifetime && code === 'pro_monthly') return;
    // Going back down means cancelling the subscription, which Stripe's portal does.
    if (code === 'free' || (code === 'pro_lifetime' && hasLifetime)) {
      if (purchasedPlanCode !== 'free') runBilling(manageBilling);
    } else runBilling(() => buyPlan(code, currency));
  }

  const planOptions: Option<PlanCode>[] = [
    { value: 'free', flag: PLANS.free.icon, label: t.plans.free, detail: t.plans.freeDetail(PLANS.free.wordLimit) },
    {
      value: 'pro_monthly',
      flag: PLANS.pro_monthly.icon,
      label: t.plans.proMonthly,
      detail: t.plans.proMonthlyDetail(formatPrice('pro_monthly', currency, uiLanguage.locale)),
    },
    {
      value: 'gold_monthly',
      flag: PLANS.gold_monthly.icon,
      label: t.plans.gold,
      detail: t.plans.goldDetail(formatPrice('gold_monthly', currency, uiLanguage.locale)),
    },
    {
      value: 'pro_lifetime',
      flag: PLANS.pro_lifetime.icon,
      label: t.plans.proLifetime,
      detail: t.plans.proLifetimeDetail(formatPrice('pro_lifetime', currency, uiLanguage.locale)),
    },
  ];

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionTitle>{t.settings.learningLanguage}</SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            {t.settings.learningLanguageHint}
          </ThemedText>
          <OptionPicker
            value={languageCode}
            onChange={setLanguage}
            options={(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => ({
              value: code,
              flag: LANGUAGES[code].flag,
              label: t.languageNames[code],
            }))}
          />
        </View>

        <View style={styles.section}>
          <SectionTitle>{t.settings.level}</SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            {t.settings.levelHint}
          </ThemedText>
          <OptionPicker
            value={level}
            onChange={setLevel}
            options={LEVELS.map((code) => ({ value: code, flag: code, label: t.levels[code] }))}
          />
        </View>

        <View style={styles.section}>
          <SectionTitle>{t.plans.title}</SectionTitle>
          {wordCount !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {plan.wordLimit === null ? t.plans.unlimited(wordCount) : t.plans.usage(wordCount, plan.wordLimit)}
            </ThemedText>
          )}
          {/* Only when the grant, not a purchase, gives the current plan. */}
          {planGrant && planCode !== purchasedPlanCode && (
            <ThemedText type="small" themeColor="success">
              {t.plans.granted(
                planGrant.plan === 'gold_monthly' ? t.plans.gold : 'Pro',
                planGrant.validUntil.toLocaleDateString(uiLanguage.locale, { dateStyle: 'long' }),
              )}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {hasLifetime ? t.plans.lifetimeOwned : t.plans.choose}
          </ThemedText>
          <OptionPicker value={planCode} onChange={choosePlan} options={planOptions} />
          {billingBusy && (
            <ThemedText type="small" themeColor="textSecondary">
              {t.plans.opening}
            </ThemedText>
          )}
          {billingError && (
            <ThemedText type="small" themeColor="danger">
              {billingError}
            </ThemedText>
          )}
          {purchasedPlanCode !== 'free' && (
            <Button
              title={t.plans.manage}
              variant="secondary"
              onPress={() => runBilling(manageBilling)}
              disabled={billingBusy}
            />
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle>{t.settings.appLanguage}</SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            {t.settings.appLanguageHint}
          </ThemedText>
          <OptionPicker
            value={uiLanguageCode}
            onChange={setUiLanguage}
            // Each language under its own name, so it can be found whatever the current language is.
            options={(Object.keys(UI_LANGUAGES) as UiLanguageCode[]).map((code) => ({
              value: code,
              flag: UI_LANGUAGES[code].flag,
              label: UI_LANGUAGES[code].name,
            }))}
          />
        </View>

        <View style={styles.section}>
          <SectionTitle>{t.settings.account}</SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            {user?.email ?? user?.displayName ?? '—'}
          </ThemedText>
          <Button title={t.settings.signOut} variant="secondary" onPress={signOut} />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: 700,
    textAlign: 'center',
    color: '#8CCBFF',
    letterSpacing: 0.5,
    marginBottom: Spacing.one,
    textShadowColor: 'rgba(75, 163, 245, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  flag: {
    fontSize: 24,
    lineHeight: 32,
  },
  optionLabel: {
    flex: 1,
    gap: Spacing.half,
  },
});
