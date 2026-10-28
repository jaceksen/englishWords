import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A long task in progress, shown in the middle of the screen; hidden when `message` is null. */
export function BusyModal({ message }: { message: string | null }) {
  const theme = useTheme();
  return (
    // Back does nothing: the task cannot be cancelled once it is sent to the AI.
    <Modal visible={message !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: theme.backgroundElement, borderColor: theme.primary }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="smallBold" style={styles.message} accessibilityLiveRegion="polite">
            {message}
          </ThemedText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  box: {
    minWidth: 240,
    maxWidth: 360,
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: 1.5,
  },
  message: {
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
  },
});
