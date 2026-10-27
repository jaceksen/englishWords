import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { LANGUAGES, type LanguageCode } from '@/lib/languages';
import { useSettings } from '@/lib/settings';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, signOut } = useAuth();
  const { languageCode, setLanguage } = useSettings();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold">Język nauki</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Lista słówek, dodawanie i quiz dotyczą wybranego języka. Słówka z innych języków zostają zapisane.
          </ThemedText>
          {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => {
            const language = LANGUAGES[code];
            const selected = code === languageCode;
            return (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setLanguage(code)}
                style={[
                  styles.option,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: selected ? theme.primary : 'transparent',
                  },
                ]}>
                <ThemedText style={styles.flag}>{language.flag}</ThemedText>
                <ThemedText style={styles.optionLabel}>{language.name}</ThemedText>
                {selected && <ThemedText themeColor="primary">✓</ThemedText>}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold">Konto</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {user?.email ?? user?.displayName ?? '—'}
          </ThemedText>
          <Button title="Wyloguj" variant="secondary" onPress={signOut} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  flag: {
    fontSize: 24,
    lineHeight: 32,
  },
  optionLabel: {
    flex: 1,
  },
});
