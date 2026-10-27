import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { UiLanguageCode } from '@/i18n';
import { aiErrorMessage, suggestWord } from '@/lib/ai';
import { useAuth } from '@/lib/auth';
import { LANGUAGES, type LanguageCode } from '@/lib/languages';
import { useSettings } from '@/lib/settings';
import { useSpeechInput } from '@/lib/speech';
import { addWord, countWords, deleteWord, getWord, updateWord, type WordInput } from '@/lib/words';

const BACKGROUND = require('@/assets/images/backgrounds/bg-add.jpg');

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
  const { t } = settings;
  // A word being edited keeps its own language, even if the setting changed since.
  const [lang, setLang] = useState<LanguageCode>(settings.languageCode);
  const language = LANGUAGES[lang];
  // Translations are in the app language, except for an edited word that keeps its own until re-suggested.
  const [nativeLang, setNativeLang] = useState<UiLanguageCode>(settings.uiLanguageCode);
  const speech = useSpeechInput({ noPermission: t.errors.noMicPermission });
  const [target, setTarget] = useState<VoiceTarget | null>(null);

  const [word, setWord] = useState('');
  const [context, setContext] = useState('');
  const [translations, setTranslations] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [definition, setDefinition] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wordLimit = settings.plan.wordLimit;
  const [wordCount, setWordCount] = useState<number | null>(null);
  // The free plan caps how many words can be saved; editing an existing word is always allowed.
  const limitReached = !id && wordLimit !== null && wordCount !== null && wordCount >= wordLimit;

  // Editing: load the existing word once.
  useEffect(() => {
    if (!user || !id) return;
    getWord(user.uid, id).then((existing) => {
      if (!existing) return;
      setLang(existing.lang);
      setNativeLang(existing.nativeLang);
      setWord(existing.word);
      setContext(existing.context);
      setTranslations(existing.translations.join(', '));
      setPartOfSpeech(existing.partOfSpeech);
      setDefinition(existing.definition);
    });
  }, [user, id]);

  useEffect(() => {
    if (!user || id) return;
    countWords(user.uid)
      .then(setWordCount)
      .catch(() => {});
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
      const s = await suggestWord({
        lang,
        nativeLang: settings.uiLanguageCode,
        word: word.trim(),
        context: context.trim(),
      });
      setWord(s.word);
      setContext(s.context);
      setTranslations(s.translations.join(', '));
      setPartOfSpeech(s.partOfSpeech);
      setDefinition(s.definition);
      setNativeLang(settings.uiLanguageCode);
      return { ...s, nativeLang: settings.uiLanguageCode };
    } catch (e) {
      setError(aiErrorMessage(e, t));
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
      if (!id && wordLimit !== null) {
        const count = await countWords(user.uid);
        setWordCount(count);
        if (count >= wordLimit) return;
      }
      let input: WordInput = {
        word: word.trim(),
        nativeLang,
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

  function confirmDelete() {
    if (!user || !id) return;
    Alert.alert(t.words.deleteTitle, word, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWord(user.uid, id);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <Stack.Screen options={{ title: `${language.flag} ${id ? t.titles.editWord : t.titles.addWord}` }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {limitReached && wordLimit !== null && (
            <ThemedView type="backgroundElement" style={styles.info}>
              <ThemedText type="small">{t.plans.limitReached(wordLimit)}</ThemedText>
              <Button title={t.plans.upgrade} onPress={() => router.push('/settings')} />
            </ThemedView>
          )}
          <Field
            label={t.add.word(t.languageNames[lang])}
            value={target === 'word' && speech.listening ? speech.partial : word}
            onChangeText={setWord}
            autoCapitalize="none"
            placeholder={t.common.example(language.wordExample)}
            onMicPress={() => dictate('word')}
            listening={target === 'word' && speech.listening}
          />
          <Field
            label={t.add.context(t.languageNames[lang])}
            value={target === 'context' && speech.listening ? speech.partial : context}
            onChangeText={setContext}
            multiline
            placeholder={t.common.example(language.contextExample)}
            onMicPress={() => dictate('context')}
            listening={target === 'context' && speech.listening}
          />
          <Field
            label={t.add.translations(t.languageNames[nativeLang])}
            value={translations}
            onChangeText={setTranslations}
            placeholder={t.add.translationsPlaceholder}
          />
          <Button
            title={t.add.suggest}
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
          <Button
            title={t.common.save}
            onPress={save}
            loading={saving}
            disabled={!word.trim() || suggesting || limitReached}
          />
          {!!id && <Button title={t.common.delete} variant="danger" onPress={confirmDelete} disabled={saving} />}
        </ScrollView>
      </KeyboardAvoidingView>
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
  info: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
