import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { formatDayHeader } from '@/lib/dates';
import { deleteWord, MAX_BOX, subscribeWords, type Word } from '@/lib/words';

export default function WordsScreen() {
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    return subscribeWords(user.uid, setWords, (e) => setError(e.message));
  }, [user]);

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
    return [...byDay].map(([day, data]) => ({ title: formatDayHeader(day), data }));
  }, [words, search]);

  function confirmDelete(word: Word) {
    Alert.alert('Usunąć słówko?', word.word, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => user && deleteWord(user.uid, word.id) },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={signOut} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Wyloguj
              </ThemedText>
            </Pressable>
          ),
        }}
      />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Szukaj…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        {error && <ThemedText themeColor="danger">{error}</ThemedText>}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {words === null ? 'Ładowanie…' : 'Brak słówek. Dodaj pierwsze!'}
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
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold" style={styles.word}>
                    {item.word}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {'●'.repeat(item.stats.box) + '○'.repeat(MAX_BOX - item.stats.box)}
                  </ThemedText>
                </View>
                {item.translations.length > 0 && <ThemedText type="small">{item.translations.join(', ')}</ThemedText>}
                {!!item.context && (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                    „{item.context}”
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          )}
        />
        <View style={styles.actions}>
          <Button title="+ Dodaj słówko" onPress={() => router.push('/add')} style={styles.action} />
          <Button
            title="Quiz"
            variant="secondary"
            disabled={!words?.length}
            onPress={() => router.push('/quiz/setup')}
            style={styles.action}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
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
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  word: {
    fontSize: 17,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  action: {
    flex: 1,
  },
});
