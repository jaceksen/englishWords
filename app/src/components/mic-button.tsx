import { Image, Pressable, StyleSheet } from 'react-native';

import { useT } from '@/lib/settings';

const MIC_BUTTON = require('@/assets/images/mic-button.png');
const STOP_BUTTON = require('@/assets/images/stop-button.png');

type MicButtonProps = {
  listening: boolean;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
};

export function MicButton({ listening, onPress, size = 48, disabled }: MicButtonProps) {
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={listening ? t.voice.micStop : t.voice.micStart}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] },
      ]}>
      <Image source={listening ? STOP_BUTTON : MIC_BUTTON} style={{ width: size, height: size }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
