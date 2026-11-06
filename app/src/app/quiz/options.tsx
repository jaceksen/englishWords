import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chips } from '@/components/chips';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { RANGE_KEYS } from '@/lib/dates';
import { directionLabel, ROUND_OPTIONS, type DirectionChoice } from '@/lib/quiz';
import { setQuizOptions, useQuizOptions, type ExampleMode } from '@/lib/quiz-options';
import { useSettings } from '@/lib/settings';

const BACKGROUND = require('@/assets/images/backgrounds/bg-quiz-setup.jpg');
const COUNTS = [5, 10, 20, 0] as const; // 0 = all

/** Quiz settings, opened with the gear on the quiz screen; changes apply right away. */
export default function QuizOptionsScreen() {
  const { language, uiLanguageCode, t, plan } = useSettings();
  const { range, direction, mode, count, rounds, example, pause } = useQuizOptions();
  // Gold only; other plans see it locked.
  const extrasLocked = !plan.voiceExtras;

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Chips
          label={t.setup.range}
          value={range}
          onChange={(value) => setQuizOptions({ range: value })}
          // "Marked" (words ticked on the list) is a Pro and Gold feature.
          options={RANGE_KEYS.filter((value) => value !== 'marked' || plan.markWords).map((value) => ({
            value,
            label: t.ranges[value],
          }))}
        />
        <Chips
          label={t.setup.direction}
          value={direction}
          onChange={(value) => setQuizOptions({ direction: value })}
          options={(['translate', 'recall', 'cloze', 'mix'] as DirectionChoice[]).map((value) => ({
            value,
            label: directionLabel(value, language, uiLanguageCode, t),
          }))}
        />
        <Chips
          label={t.setup.mode}
          value={mode}
          onChange={(value) => setQuizOptions({ mode: value })}
          options={[
            { value: 'text', label: t.setup.modeText },
            { value: 'voice', label: t.setup.modeVoice },
          ]}
        />
        <Chips
          label={t.setup.count}
          value={count}
          onChange={(value) => setQuizOptions({ count: value })}
          options={COUNTS.map((value) => ({ value, label: value ? String(value) : t.setup.countAll }))}
        />
        <Chips
          label={t.setup.rounds}
          value={rounds}
          onChange={(value) => setQuizOptions({ rounds: value })}
          options={ROUND_OPTIONS.map((value) => ({
            value,
            label: value === 1 ? t.setup.noRepeat : Number.isFinite(value) ? `${value}×` : '∞',
          }))}
        />
        {rounds > 1 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {Number.isFinite(rounds) ? t.setup.roundsHint : t.setup.endlessHint}
          </ThemedText>
        )}
        {mode === 'voice' && (
          <View style={styles.section}>
            {extrasLocked && (
              <>
                <ThemedText type="smallBold" style={styles.center}>
                  🔒 {t.setup.exampleLocked}
                </ThemedText>
                <Button title={t.import.upgrade} onPress={() => router.push('/settings')} />
              </>
            )}
            <View style={[styles.section, extrasLocked && styles.dimmed]} pointerEvents={extrasLocked ? 'none' : 'auto'}>
              <Chips
                label={t.setup.example}
                value={extrasLocked ? 'off' : example}
                onChange={(value) => setQuizOptions({ example: value })}
                options={(['off', 'wrong', 'all'] as ExampleMode[]).map((value) => ({
                  value,
                  label: { off: t.setup.exampleOff, wrong: t.setup.exampleWrong, all: t.setup.exampleAll }[value],
                }))}
              />
              <Chips
                label={t.setup.pause}
                value={extrasLocked ? 'off' : pause}
                onChange={(value) => setQuizOptions({ pause: value })}
                options={(['off', 'wrong', 'all'] as ExampleMode[]).map((value) => ({
                  value,
                  label: { off: t.setup.exampleOff, wrong: t.setup.exampleWrong, all: t.setup.exampleAll }[value],
                }))}
              />
            </View>
          </View>
        )}
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
    gap: Spacing.four,
  },
  center: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.three,
  },
  dimmed: {
    opacity: 0.4,
  },
});
