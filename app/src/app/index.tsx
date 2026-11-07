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
import { pronunciationMatches } from '@/lib/quiz';
import { speak, stopSpeaking, useSpeechInput } from '@/lib/speech';
import { deleteWord, setMarked, subscribeWords, unmarkWords, type Word } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-home.jpg');
const ADD_BUTTON = require('@/assets/images/add-word-button.png');
const QUIZ_BUTTON = require('@/assets/images/start-button.png');

/** How long the pronunciation result stays on the card; a plain "well done" needs less time to read. */
const PRACTICE_RESULT_MS = 4000;
const PRACTICE_OK_MS = 2000;

type Practice = { id: string; status: 'listening' | 'ok' | 'wrong' | 'silent'; heard: string };

export default function WordsScreen() {
  const { user } = useAuth();
  const { languageCode, language, t, uiLanguage, plan } = useSettings();
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

  // Pro and Gold: ticked words make up the "marked" quiz range; counted over all words, not just the search.
  const canMark = plan.markWords;
  const markedIds = useMemo(() => (words ?? []).filter((w) => w.marked).map((w) => w.id), [words]);

  function toggleMarked(word: Word) {
    if (user) setMarked(user.uid, word.id, !word.marked).catch((e) => setError(e.message));
  }

  function unmarkAll() {
    if (user) unmarkWords(user.uid, markedIds).catch((e) => setError(e.message));
  }

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

  // Gold: quick pronunciation check. The result shows on the card and fades after a few seconds.
  const canPractise = plan.pronunciation;
  const speech = useSpeechInput({ noPermission: t.errors.noMicPermission });
  const [practice, setPractice] = useState<Practice | null>(null);
  const practiceRequest = useRef(0);
  const practiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Leaving the screen ends listening and the pending result timer.
  const abortListening = speech.abort;
  useEffect(
    () => () => {
      if (practiceTimer.current) clearTimeout(practiceTimer.current);
      abortListening();
    },
    [abortListening],
  );

  async function practise(word: Word) {
    // One recognition at a time: a tap while listening (on any card) just ends it.
    if (practice?.status === 'listening') {
      speech.stop();
      return;
    }
    if (practiceTimer.current) clearTimeout(practiceTimer.current);
    stopSpeaking();
    const request = ++practiceRequest.current;
    setPractice({ id: word.id, status: 'listening', heard: '' });
    const heard = await speech.listen(language.speech);
    if (practiceRequest.current !== request) return;
    const status = !heard ? 'silent' : pronunciationMatches(word, heard) ? 'ok' : 'wrong';
    setPractice({ id: word.id, status, heard });
    practiceTimer.current = setTimeout(() => {
      if (practiceRequest.current === request) setPractice(null);
    }, status === 'ok' ? PRACTICE_OK_MS : PRACTICE_RESULT_MS);
  }

  function practiceMessage(p: Practice) {
    if (speech.error) return { text: speech.error, color: theme.danger };
    switch (p.status) {
      case 'listening':
        return { text: t.words.practiceListening, color: theme.textSecondary };
      case 'ok':
        return { text: t.words.practiceOk, color: theme.success };
      case 'wrong':
        return { text: t.words.practiceWrong(p.heard), color: theme.danger };
      case 'silent':
        return { text: t.words.practiceSilent, color: theme.textSecondary };
    }
  }

  // Import is Gold only: other plans get a notice with a way to the plans instead of the import screen.
  function openImport() {
    if (plan.importWords) {
      router.push('/import');
      return;
    }
    Alert.alert(`🔒 ${t.titles.import}`, t.import.locked, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.import.upgrade, onPress: () => router.push('/settings') },
    ]);
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <Stack.Screen
        options={{
          title: `${language.flag} ${t.titles.words}`,
          headerRight: () => (
            <View style={styles.headerIcons}>
              <Pressable onPress={openImport} hitSlop={8} accessibilityLabel={t.words.import}>
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
        {canMark && markedIds.length > 0 && (
          <View style={styles.markedRow}>
            <ThemedText type="smallBold">{t.words.markedCount(markedIds.length)}</ThemedText>
            <Pressable onPress={unmarkAll} hitSlop={8} accessibilityRole="button">
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                {t.words.unmarkAll}
              </ThemedText>
            </Pressable>
          </View>
        )}
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
                {canMark && (
                  <Pressable
                    onPress={() => toggleMarked(item)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${t.words.mark}: ${item.word}`}
                    accessibilityState={{ checked: item.marked }}
                    style={[
                      styles.checkbox,
                      { borderColor: item.marked ? theme.primary : theme.textSecondary },
                      item.marked && { backgroundColor: theme.primary },
                    ]}>
                    {item.marked && <ThemedText style={[styles.checkmark, { color: theme.onPrimary }]}>✓</ThemedText>}
                  </Pressable>
                )}
                <View style={styles.cardText}>
                  <View style={styles.wordRow}>
                    <Pressable
                      onPress={() => say(item.word, `${item.id}:word`)}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.words.speak}: ${item.word}`}
                      accessibilityState={{ busy: loadingKey === `${item.id}:word` }}
                      style={styles.wordPressable}>
                      {/* Shows that tapping the word plays it. */}
                      <ThemedText style={styles.wordSpeaker}>🔊</ThemedText>
                      <ThemedText type="smallBold" style={styles.word}>
                        {item.word}
                      </ThemedText>
                      {loadingKey === `${item.id}:word` && <ActivityIndicator size="small" color={theme.primary} />}
                    </Pressable>
                    {canPractise && (
                      <Pressable
                        onPress={() => practise(item)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`${t.words.practice}: ${item.word}`}
                        accessibilityState={{ busy: practice?.id === item.id && practice.status === 'listening' }}>
                        <ThemedText style={styles.wordSpeaker}>
                          {practice?.id === item.id && practice.status === 'listening' ? '⏹' : '🎤'}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                  {item.translations.length > 0 && (
                    <ThemedText type="small" style={styles.meaning}>
                      {item.translations.join(', ')}
                    </ThemedText>
                  )}
                  {practice?.id === item.id &&
                    (() => {
                      const message = practiceMessage(practice);
                      return (
                        <ThemedText type="smallBold" style={[styles.meaning, { color: message.color }]}>
                          {message.text}
                        </ThemedText>
                      );
                    })()}
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
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: 700,
  },
  markedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
  },
  cardText: {
    flex: 1,
    gap: Spacing.two,
  },
  // The word and its meaning are the card's headline, centred like on the web portal.
  wordRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: '100%',
  },
  wordPressable: {
    flexShrink: 1,
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
    textAlign: 'center',
  },
  meaning: {
    textAlign: 'center',
  },
  wordSpeaker: {
    fontSize: 16,
    lineHeight: 28,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
