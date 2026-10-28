import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  enrichRows,
  extractWords,
  importErrorMessage,
  pickSpreadsheet,
  readSpreadsheet,
  setPendingImport,
  takePhoto,
  type ImportItem,
} from '@/lib/import';
import { useSettings } from '@/lib/settings';
import { fetchWords } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-add.jpg');

/** Most known words sent to the AI so it does not suggest them again. */
const MAX_KNOWN = 1000;

type PhotoMode = 'marked' | 'auto';

export default function ImportScreen() {
  const { user } = useAuth();
  const { t, languageCode, uiLanguageCode, level, plan } = useSettings();
  // Free users see the import methods, but locked.
  const locked = !plan.importWords;
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null;

  async function knownWords() {
    if (!user) return [];
    return (await fetchWords(user.uid, languageCode, 'all')).map((w) => w.word);
  }

  function openReview(items: ImportItem[], skipped: number, emptyMessage: string) {
    if (items.length === 0) {
      setError(emptyMessage);
      return;
    }
    setPendingImport({ items, skipped, lang: languageCode, nativeLang: uiLanguageCode });
    router.push('/import/review');
  }

  async function run(task: () => Promise<void>) {
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(importErrorMessage(e, t, languageCode));
    } finally {
      setStatus(null);
    }
  }

  function fromSpreadsheet() {
    run(async () => {
      const file = await pickSpreadsheet();
      if (!file) return;
      setStatus(t.import.reading);
      const rows = await readSpreadsheet(file, languageCode);
      if (rows.length === 0) {
        setError(t.import.noWords);
        return;
      }
      const known = await knownWords();
      const { items, skipped } = await enrichRows(rows, languageCode, uiLanguageCode, new Set(known), (done, total) =>
        setStatus(t.import.enriching(done, total)),
      );
      openReview(items, skipped, t.import.allKnown);
    });
  }

  function fromPhoto(mode: PhotoMode, source: 'camera' | 'library') {
    run(async () => {
      const image = await takePhoto(source);
      if (!image) return;
      setStatus(t.import.analyzing);
      const known = await knownWords();
      const items = await extractWords(
        {
          lang: languageCode,
          nativeLang: uiLanguageCode,
          mode,
          level,
          image,
          known: mode === 'auto' ? known.slice(0, MAX_KNOWN) : undefined,
        },
        new Set(known),
      );
      openReview(items, 0, t.import.noWords);
    });
  }

  function photoButtons(mode: PhotoMode) {
    return (
      <View style={styles.row}>
        <Button
          title={t.import.camera}
          variant="secondary"
          style={styles.flex}
          disabled={locked || busy}
          onPress={() => fromPhoto(mode, 'camera')}
        />
        <Button
          title={t.import.gallery}
          variant="secondary"
          style={styles.flex}
          disabled={locked || busy}
          onPress={() => fromPhoto(mode, 'library')}
        />
      </View>
    );
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {locked && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">🔒 {t.import.locked}</ThemedText>
            <Button title={t.import.upgrade} onPress={() => router.push('/settings')} />
          </ThemedView>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {t.import.intro}
        </ThemedText>

        <ThemedView type="backgroundElement" style={[styles.card, locked && styles.dimmed]}>
          <ThemedText type="smallBold">📊 {t.import.spreadsheet}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.import.spreadsheetHint}
          </ThemedText>
          <Button title={t.import.chooseFile} variant="secondary" disabled={locked || busy} onPress={fromSpreadsheet} />
        </ThemedView>

        <ThemedView type="backgroundElement" style={[styles.card, locked && styles.dimmed]}>
          <ThemedText type="smallBold">🖍️ {t.import.marked}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.import.markedHint}
          </ThemedText>
          {photoButtons('marked')}
        </ThemedView>

        <ThemedView type="backgroundElement" style={[styles.card, locked && styles.dimmed]}>
          <ThemedText type="smallBold">📷 {t.import.photoText}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.import.autoHint(level)}
          </ThemedText>
          {photoButtons('auto')}
        </ThemedView>

        <ThemedView type="backgroundElement" style={[styles.card, locked && styles.dimmed]}>
          <ThemedText type="smallBold">📝 {t.import.pasteText}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.import.autoHint(level)}
          </ThemedText>
          <Button
            title={t.import.pasteText}
            variant="secondary"
            disabled={locked || busy}
            onPress={() => router.push('/import/text')}
          />
        </ThemedView>

        {busy && (
          <View style={styles.row}>
            <ActivityIndicator />
            <ThemedText type="small">{status}</ThemedText>
          </View>
        )}
        {error && (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        )}
      </ScrollView>
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
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  dimmed: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});
