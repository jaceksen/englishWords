import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { RoundBreak } from '@/hooks/use-quiz';
import type { Translations } from '@/i18n';
import { useT } from '@/lib/settings';

export function roundBreakMessage({ round, rounds, correct, total }: RoundBreak, t: Translations) {
  return t.spoken.roundDone(round, rounds, correct, total);
}

export function RoundBreakCard({ roundBreak }: { roundBreak: RoundBreak }) {
  const t = useT();
  const { round, rounds, correct, total } = roundBreak;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {t.quiz.roundDone(round, rounds)}
      </ThemedText>
      <ThemedText type="subtitle">
        {correct} / {total}
      </ThemedText>
      <ThemedText themeColor="textSecondary">{t.quiz.nextRoundSoon(round + 1)}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
});
