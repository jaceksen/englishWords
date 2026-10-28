import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { getPendingImport, setPendingImport, toWordInput } from '@/lib/import';
import { useSettings } from '@/lib/settings';
import { addWords } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-add.jpg');

export default function ImportReviewScreen() {
  const { user } = useAuth();
  const { t } = useSettings();
  const theme = useTheme();
  const [pending] = useState(getPendingImport);
  const items = pending?.items ?? [];
  const [selected, setSelected] = useState(() => new Set(items.filter((i) => i.recommended).map((i) => i.key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!user || !pending || selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const inputs = items.filter((i) => selected.has(i.key)).map((i) => toWordInput(i, pending.nativeLang));
      await addWords(user.uid, pending.lang, inputs);
      setPendingImport(null);
      router.dismissTo('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <ThemedText type="smallBold">{t.import.selected(selected.size, items.length)}</ThemedText>
        {!!pending?.skipped && (
          <ThemedText type="small" themeColor="textSecondary">
            {t.import.skipped(pending.skipped)}
          </ThemedText>
        )}
        <View style={styles.row}>
          <Button
            title={t.import.selectAll}
            variant="secondary"
            style={styles.flex}
            onPress={() => setSelected(new Set(items.map((i) => i.key)))}
          />
          <Button title={t.import.selectNone} variant="secondary" style={styles.flex} onPress={() => setSelected(new Set())} />
        </View>
        <FlatList
          data={items}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const checked = selected.has(item.key);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                onPress={() => toggle(item.key)}>
                <ThemedView
                  type="backgroundElement"
                  style={[styles.card, { borderColor: checked ? theme.primary : 'transparent' }]}>
                  <ThemedText style={styles.check}>{checked ? '☑' : '☐'}</ThemedText>
                  <View style={styles.cardText}>
                    <View style={styles.row}>
                      <ThemedText type="smallBold" style={styles.word}>
                        {item.word}
                      </ThemedText>
                      {!!item.cefr && (
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.cefr}
                        </ThemedText>
                      )}
                    </View>
                    {item.translations.length > 0 && <ThemedText type="small">{item.translations.join(', ')}</ThemedText>}
                    {!!item.context && (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        „{item.context}”
                      </ThemedText>
                    )}
                    {item.known && (
                      <ThemedText type="small" themeColor="success">
                        {t.import.known}
                      </ThemedText>
                    )}
                  </View>
                </ThemedView>
              </Pressable>
            );
          }}
        />
        {error && (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        )}
        <Button title={t.import.save(selected.size)} onPress={save} loading={saving} disabled={selected.size === 0} />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  check: {
    fontSize: 24,
    lineHeight: 30,
  },
  cardText: {
    flex: 1,
    gap: Spacing.one,
  },
  word: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 700,
    flexShrink: 1,
  },
});
