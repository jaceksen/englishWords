import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { suggestWord } from '@/lib/ai';
import { useAuth } from '@/lib/auth';
import { LANGUAGES, type LanguageCode } from '@/lib/languages';
import { useSettings } from '@/lib/settings';
import { useSpeechInput } from '@/lib/speech';
import { addWord, getWord, updateWord, type WordInput } from '@/lib/words';

type VoiceTarget = 'word' | 'context';

function splitTranslations(text: string) {
  return text
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function AddWordScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const settings = useSettings();
  // A word being edited keeps its own language, even if the setting changed since.
  const [lang, setLang] = useState<LanguageCode>(settings.languageCode);
  const language = LANGUAGES[lang];
  const speech = useSpeechInput();
  const [target, setTarget] = useState<VoiceTarget | null>(null);

  const [word, setWord] = useState('');
  const [context, setContext] = useState('');
  const [translations, setTranslations] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [definition, setDefinition] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing: load the existing word once.
  useEffect(() => {
    if (!user || !id) return;
    getWord(user.uid, id).then((existing) => {
      if (!existing) return;
      setLang(existing.lang);
      setWord(existing.word);
      setContext(existing.context);
      setTranslations(existing.translations.join(', '));
      setPartOfSpeech(existing.partOfSpeech);
      setDefinition(existing.definition);
    });
  }, [user, id]);

  async function dictate(field: VoiceTarget) {
    if (speech.listening) {
      speech.stop();
      return;
    }
    setTarget(field);
    const text = await speech.listen(language.speech, { short: field === 'word' });
    setTarget(null);
    if (!text) return;
    if (field === 'word') setWord(text);
    else setContext(text.charAt(0).toUpperCase() + text.slice(1));
  }

  async function suggest(): Promise<WordInput | null> {
    if (!word.trim()) return null;
    setSuggesting(true);
    setError(null);
    try {
      const s = await suggestWord(lang, word.trim(), context.trim());
      setWord(s.word);
      setContext(s.context);
      setTranslations(s.translations.join(', '));
      setPartOfSpeech(s.partOfSpeech);
      setDefinition(s.definition);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSuggesting(false);
    }
  }

  async function save() {
    if (!user || !word.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let input: WordInput = {
        word: word.trim(),
        context: context.trim(),
        translations: splitTranslations(translations),
        partOfSpeech,
        definition,
      };
      // The quiz needs a translation, so fill it in automatically when left empty.
      if (input.translations.length === 0) {
        input = (await suggest()) ?? input;
      }
      if (id) await updateWord(user.uid, id, input);
      else await addWord(user.uid, lang, input);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: `${language.flag} ${id ? 'Edytuj słówko' : 'Dodaj słówko'}` }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field
            label={`Słówko (${language.name.toLowerCase()})`}
            value={target === 'word' && speech.listening ? speech.partial : word}
            onChangeText={setWord}
            autoCapitalize="none"
            placeholder={language.wordPlaceholder}
            onMicPress={() => dictate('word')}
            listening={target === 'word' && speech.listening}
          />
          <Field
            label={`Zdanie z kontekstem (${language.name.toLowerCase()})`}
            value={target === 'context' && speech.listening ? speech.partial : context}
            onChangeText={setContext}
            multiline
            placeholder={language.contextPlaceholder}
            onMicPress={() => dictate('context')}
            listening={target === 'context' && speech.listening}
          />
          <Field
            label="Tłumaczenie (PL, oddziel przecinkami)"
            value={translations}
            onChangeText={setTranslations}
            placeholder="np. niechętny, oporny"
          />
          <Button
            title="✨ Podpowiedz tłumaczenie"
            variant="secondary"
            onPress={suggest}
            loading={suggesting}
            disabled={!word.trim()}
          />
          {(!!partOfSpeech || !!definition) && (
            <ThemedView type="backgroundElement" style={styles.info}>
              {!!partOfSpeech && (
                <ThemedText type="small" themeColor="textSecondary">
                  {partOfSpeech}
                </ThemedText>
              )}
              {!!definition && <ThemedText type="small">{definition}</ThemedText>}
            </ThemedView>
          )}
          {(error || speech.error) && (
            <ThemedText type="small" themeColor="danger">
              {error ?? speech.error}
            </ThemedText>
          )}
          <Button title="Zapisz" onPress={save} loading={saving} disabled={!word.trim() || suggesting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
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
  info: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
