import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImageButton } from '@/components/image-button';
import { MasteryBadge } from '@/components/mastery-badge';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { formatDayHeader } from '@/lib/dates';
import { useSettings } from '@/lib/settings';
import { deleteWord, subscribeWords, type Word } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-home.jpg');
const ADD_BUTTON = require('@/assets/images/add-word-button.png');
const QUIZ_BUTTON = require('@/assets/images/quiz-button.png');

export default function WordsScreen() {
  const { user } = useAuth();
  const { languageCode, language, t, uiLanguage } = useSettings();
  const theme = useTheme();
  const [loaded, setLoaded] = useState<{ lang: string; words: Word[] } | null>(null);
  // Words of the previously selected language are stale while the new ones load.
  const words = loaded?.lang === languageCode ? loaded.words : null;
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    return subscribeWords(
      user.uid,
      languageCode,
      (result) => setLoaded({ lang: languageCode, words: result }),
      (e) => setError(e.message),
    );
  }, [user, languageCode]);

  const sections = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = (words ?? []).filter(
      (w) =>
        !needle ||
        w.word.toLowerCase().includes(needle) ||
        w.translations.some((t) => t.toLowerCase().includes(needle)),
    );
    const byDay = new Map<string, Word[]>();
    for (const word of filtered) {
      byDay.set(word.dayKey, [...(byDay.get(word.dayKey) ?? []), word]);
    }
    return [...byDay].map(([day, data]) => ({ title: formatDayHeader(day, t, uiLanguage), data }));
  }, [words, search, t, uiLanguage]);

  function confirmDelete(word: Word) {
    Alert.alert(t.words.deleteTitle, word.word, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.delete, style: 'destructive', onPress: () => user && deleteWord(user.uid, word.id) },
    ]);
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <Stack.Screen
        options={{
          title: `${language.flag} ${t.titles.words}`,
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel={t.words.settings}>
              <ThemedText style={styles.headerIcon}>⚙️</ThemedText>
            </Pressable>
          ),
        }}
      />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t.words.search}
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <View style={styles.actions}>
          <ImageButton source={ADD_BUTTON} label={t.titles.addWord} size={72} onPress={() => router.push('/add')} />
          <ImageButton
            source={QUIZ_BUTTON}
            label={t.words.quiz}
            size={72}
            disabled={!words?.length}
            onPress={() => router.push('/quiz/setup')}
          />
        </View>
        {error && <ThemedText themeColor="danger">{error}</ThemedText>}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {words === null ? t.common.loading : t.words.empty}
            </ThemedText>
          }
          renderSectionHeader={({ section }) => (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              {section.title}
            </ThemedText>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/add', params: { id: item.id } })}
              onLongPress={() => confirmDelete(item)}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <View style={styles.cardText}>
                  <ThemedText type="smallBold" style={styles.word}>
                    {item.word}
                  </ThemedText>
                  {item.translations.length > 0 && (
                    <ThemedText type="small">{item.translations.join(', ')}</ThemedText>
                  )}
                  {!!item.context && (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      „{item.context}”
                    </ThemedText>
                  )}
                </View>
                <MasteryBadge box={item.stats.box} />
              </ThemedView>
            </Pressable>
          )}
        />
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
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  headerIcon: {
    fontSize: 22,
  },
  search: {
    minHeight: 44,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
  sectionHeader: {
    marginTop: Spacing.three,
    textTransform: 'capitalize',
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardText: {
    flex: 1,
    gap: Spacing.two,
  },
  word: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
