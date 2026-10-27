import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { MicButton } from '@/components/mic-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FieldProps = TextInputProps & {
  label: string;
  /** When set, shows a microphone button next to the input. */
  onMicPress?: () => void;
  listening?: boolean;
};

export function Field({ label, onMicPress, listening = false, style, ...rest }: FieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.row}>
        <TextInput
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
            style,
          ]}
          {...rest}
        />
        {onMicPress && <MicButton listening={listening} onPress={onMicPress} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
