import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';

import { BusyModal } from '@/components/busy-modal';
import { Button } from '@/components/button';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { extractWords, importErrorMessage, setPendingImport } from '@/lib/import';
import { useSettings } from '@/lib/settings';
import { fetchWords } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-add.jpg');

// Must match MAX_TEXT_LENGTH and MAX_KNOWN in functions/src/import.ts.
const MAX_TEXT_LENGTH = 20_000;
const MAX_KNOWN = 1000;

export default function ImportTextScreen() {
  const { user } = useAuth();
  const { t, languageCode, uiLanguageCode, level } = useSettings();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findWords() {
    if (!user || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const known = (await fetchWords(user.uid, languageCode, 'all')).map((w) => w.word);
      const items = await extractWords(
        {
          lang: languageCode,
          nativeLang: uiLanguageCode,
          mode: 'auto',
          level,
          text: text.trim(),
          known: known.slice(0, MAX_KNOWN),
        },
        new Set(known),
      );
      if (items.length === 0) {
        setError(t.import.noWords);
        return;
      }
      setPendingImport({ items, skipped: 0, lang: languageCode, nativeLang: uiLanguageCode });
      router.push('/import/review');
    } catch (e) {
      setError(importErrorMessage(e, t, languageCode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="textSecondary">
            {t.import.autoHint(level)}
          </ThemedText>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={MAX_TEXT_LENGTH}
            textAlignVertical="top"
            placeholder={t.import.textPlaceholder}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}
          <Button title={t.import.findWords} onPress={findWords} loading={busy} disabled={!text.trim()} />
        </ScrollView>
      </KeyboardAvoidingView>
      <BusyModal message={busy ? t.import.analyzing : null} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  input: {
    minHeight: 240,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 16,
  },
});
