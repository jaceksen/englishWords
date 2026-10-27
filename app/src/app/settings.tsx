import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { UI_LANGUAGES, type UiLanguageCode } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { LANGUAGES, type LanguageCode } from '@/lib/languages';
import { PLANS, type PlanCode } from '@/lib/plans';
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

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { t, languageCode, setLanguage, uiLanguageCode, setUiLanguage, planCode, plan, setPlan } = useSettings();
  const [wordCount, setWordCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    countWords(user.uid)
      .then(setWordCount)
      .catch(() => setWordCount(null));
  }, [user]);

  const planOptions: Option<PlanCode>[] = [
    { value: 'free', flag: PLANS.free.icon, label: t.plans.free, detail: t.plans.freeDetail(PLANS.free.wordLimit) },
    {
      value: 'pro_monthly',
      flag: PLANS.pro_monthly.icon,
      label: t.plans.proMonthly,
      detail: t.plans.proMonthlyDetail(PLANS.pro_monthly.price),
    },
    {
      value: 'pro_lifetime',
      flag: PLANS.pro_lifetime.icon,
      label: t.plans.proLifetime,
      detail: t.plans.proLifetimeDetail(PLANS.pro_lifetime.price),
    },
  ];

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold">{t.settings.appLanguage}</ThemedText>
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
          <ThemedText type="smallBold">{t.settings.learningLanguage}</ThemedText>
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
          <ThemedText type="smallBold">{t.plans.title}</ThemedText>
          {wordCount !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {plan.wordLimit === null ? t.plans.unlimited(wordCount) : t.plans.usage(wordCount, plan.wordLimit)}
            </ThemedText>
          )}
          <OptionPicker value={planCode} onChange={setPlan} options={planOptions} />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold">{t.settings.account}</ThemedText>
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
