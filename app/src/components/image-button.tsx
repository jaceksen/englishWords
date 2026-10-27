import { Image, Pressable, StyleSheet, type ImageSourcePropType } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type ImageButtonProps = {
  source: ImageSourcePropType;
  label: string;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
};

/** Round graphic button with its label underneath. */
export function ImageButton({ source, label, onPress, size = 96, disabled }: ImageButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] },
      ]}>
      <Image source={source} style={{ width: size, height: size }} />
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  label: {
    textAlign: 'center',
  },
});
