import { ImageBackground, StyleSheet, useColorScheme, type ImageSourcePropType, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type ScreenBackgroundProps = ViewProps & {
  source: ImageSourcePropType;
};

// Dims the image over the theme background so themed text stays readable.
export function ScreenBackground({ source, style, ...rest }: ScreenBackgroundProps) {
  const theme = useTheme();
  const scheme = useColorScheme();

  return (
    <ImageBackground
      source={source}
      resizeMode="cover"
      imageStyle={{ opacity: scheme === 'dark' ? 0.6 : 0.22 }}
      style={[styles.background, { backgroundColor: theme.background }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
});
