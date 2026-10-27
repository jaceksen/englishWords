import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MAX_BOX } from '@/lib/words';

/** One award per Leitner box: sprout, bronze, silver and gold medal, silver and gold trophy. */
const AWARDS = [
  require('@/assets/images/levels/level-0.png'),
  require('@/assets/images/levels/level-1.png'),
  require('@/assets/images/levels/level-2.png'),
  require('@/assets/images/levels/level-3.png'),
  require('@/assets/images/levels/level-4.png'),
  require('@/assets/images/levels/level-5.png'),
];

/** How well a word is known: filled dots for its box, with an award that grows with it. */
export function MasteryBadge({ box }: { box: number }) {
  const level = Math.max(0, Math.min(box, MAX_BOX));
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {'●'.repeat(level) + '○'.repeat(MAX_BOX - level)}
      </ThemedText>
      <Image source={AWARDS[level]} style={level === MAX_BOX ? styles.top : styles.award} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  award: {
    width: 40,
    height: 40,
  },
  // The gold trophy is a little bigger, to make it feel earned.
  top: {
    width: 48,
    height: 48,
  },
});
