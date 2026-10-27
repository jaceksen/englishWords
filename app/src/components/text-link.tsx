import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type TextLinkProps = {
  title: string;
  onPress: () => void;
};

export function TextLink({ title, onPress }: TextLinkProps) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <ThemedText type="linkPrimary">{title}</ThemedText>
    </Pressable>
  );
}
