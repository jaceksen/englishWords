import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
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
import { speak, stopSpeaking } from '@/lib/speech';
import { deleteWord, subscribeWords, type Word } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-home.jpg');
const ADD_BUTTON = require('@/assets/images/add-word-button.png');
const QUIZ_BUTTON = require('@/assets/images/start-button.png');

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

  // What is waiting for its sound (a cloud voice can take a moment, mostly the first time): `${id}:word` or `${id}:context`.
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const sayRequest = useRef(0);

  /** Says a word or sentence in the learning language, cutting off whatever is playing. */
  function say(text: string, key: string) {
    stopSpeaking();
    const request = ++sayRequest.current;
    // Only the latest tap clears the spinner; an older one finishing late must not hide it.
    const done = () => {
      if (sayRequest.current === request) setLoadingKey(null);
    };
    setLoadingKey(key);
    speak(text, language.speech, undefined, done).finally(done);
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <Stack.Screen
        options={{
          title: `${language.flag} ${t.titles.words}`,
          headerRight: () => (
            <View style={styles.headerIcons}>
              <Pressable onPress={() => router.push('/import')} hitSlop={8} accessibilityLabel={t.words.import}>
                <ThemedText style={styles.headerIcon}>📥</ThemedText>
              </Pressable>
              <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel={t.words.settings}>
                <ThemedText style={styles.headerIcon}>⚙️</ThemedText>
              </Pressable>
            </View>
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
            <Pressable onLongPress={() => confirmDelete(item)}>
              <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
                <View style={styles.cardText}>
                  <Pressable
                    onPress={() => say(item.word, `${item.id}:word`)}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.words.speak}: ${item.word}`}
                    accessibilityState={{ busy: loadingKey === `${item.id}:word` }}
                    style={styles.wordPressable}>
                    <ThemedText type="smallBold" style={styles.word}>
                      {item.word}
                    </ThemedText>
                    {loadingKey === `${item.id}:word` && <ActivityIndicator size="small" color={theme.primary} />}
                  </Pressable>
                  {item.translations.length > 0 && (
                    <ThemedText type="small">{item.translations.join(', ')}</ThemedText>
                  )}
                  {!!item.context && (
                    <View style={styles.contextRow}>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.context}>
                        „{item.context}”
                      </ThemedText>
                      <Pressable
                        onPress={() => say(item.context, `${item.id}:context`)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`${t.words.speak}: ${item.context}`}
                        accessibilityState={{ busy: loadingKey === `${item.id}:context` }}>
                        {loadingKey === `${item.id}:context` ? (
                          <ActivityIndicator size="small" color={theme.primary} style={styles.iconSpinner} />
                        ) : (
                          <ThemedText style={styles.cardIcon}>🔊</ThemedText>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
                <View style={styles.cardSide}>
                  <MasteryBadge box={item.stats.box} />
                  <Pressable
                    onPress={() => router.push({ pathname: '/add', params: { id: item.id } })}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.titles.editWord}: ${item.word}`}>
                    <ThemedText style={styles.cardIcon}>✏️</ThemedText>
                  </Pressable>
                </View>
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
  headerIcons: {
    flexDirection: 'row',
    gap: Spacing.three,
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
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardText: {
    flex: 1,
    gap: Spacing.two,
  },
  wordPressable: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  context: {
    flex: 1,
  },
  cardSide: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardIcon: {
    fontSize: 20,
    lineHeight: 26,
  },
  // Same footprint as the 🔊 icon, so the row does not jump.
  iconSpinner: {
    width: 26,
    height: 26,
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
