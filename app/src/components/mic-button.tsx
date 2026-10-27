import { Image, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ButtonBorder } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/settings';

const STOP_BUTTON = require('@/assets/images/stop-button.png');

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
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        // The stop graphic brings its own round face and rim.
        listening ? { transform: [{ scale: pressed ? 0.92 : 1 }] } : [styles.mic, { backgroundColor: theme.primary }],
      ]}>
      {listening ? (
        <Image source={STOP_BUTTON} style={{ width: size, height: size }} />
      ) : (
        <ThemedText style={{ fontSize: size * 0.45, lineHeight: size * 0.6 }}>🎤</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mic: {
    ...ButtonBorder,
  },
});
