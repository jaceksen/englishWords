import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/settings';

type MicButtonProps = {
  listening: boolean;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
};

export function MicButton({ listening, onPress, size = 48, disabled }: MicButtonProps) {
  const theme = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={listening ? t.voice.micStop : t.voice.micStart}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: listening ? theme.danger : theme.primary,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}>
      <ThemedText style={{ fontSize: size * 0.45, lineHeight: size * 0.6 }}>{listening ? '■' : '🎤'}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
