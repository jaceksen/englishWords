import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ButtonBorder, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonProps = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'white';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background = {
    primary: theme.primary,
    secondary: theme.backgroundElement,
    danger: theme.danger,
    white: '#ffffff',
  }[variant];
  const color = variant === 'secondary' ? theme.text : variant === 'white' ? '#1F1F1F' : theme.onPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.button,
        variant === 'white' && styles.white,
        { backgroundColor: background, opacity: disabled ? 0.5 : state.pressed ? 0.8 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type="smallBold" style={{ color }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    ...ButtonBorder,
  },
  // A white outline would disappear on a white button.
  white: {
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
});
