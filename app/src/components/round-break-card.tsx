import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { RoundBreak } from '@/hooks/use-quiz';

export function roundBreakMessage({ round, rounds, correct, total }: RoundBreak) {
  return `Runda ${round} z ${rounds} zakończona. Wynik: ${correct} na ${total}. Zaczynamy rundę ${round + 1}.`;
}

export function RoundBreakCard({ roundBreak }: { roundBreak: RoundBreak }) {
  const { round, rounds, correct, total } = roundBreak;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        Runda {round} / {rounds} zakończona
      </ThemedText>
      <ThemedText type="subtitle">
        {correct} / {total}
      </ThemedText>
      <ThemedText themeColor="textSecondary">Za chwilę runda {round + 1}…</ThemedText>
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
