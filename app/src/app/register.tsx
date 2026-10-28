import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { LegalLinks } from '@/components/legal-links';
import { TextLink } from '@/components/text-link';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { Spacing } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/lib/auth';
import { useT } from '@/lib/settings';

const BACKGROUND = require('@/assets/images/backgrounds/bg-register.jpg');

// Firebase Auth's own minimum; the form checks it up front for a clearer message.
const MIN_PASSWORD_LENGTH = 6;

export default function RegisterScreen() {
  const { signUpWithEmail } = useAuth();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function register() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.register.tooShort(MIN_PASSWORD_LENGTH));
      return;
    }
    if (password !== repeat) {
      setError(t.register.mismatch);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // On success the user is signed in and the navigator moves to the word list.
      await signUpWithEmail(email, password);
    } catch (e) {
      setError(authErrorMessage(e, t));
      setLoading(false);
    }
  }

  return (
    <ScreenBackground source={BACKGROUND} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field
            label={t.common.email}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <Field
            label={t.register.passwordLabel(MIN_PASSWORD_LENGTH)}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Field
            label={t.register.repeatPassword}
            value={repeat}
            onChangeText={setRepeat}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={register}
          />
          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.notice}>
            {t.legal.registerNotice}
          </ThemedText>
          <Button
            title={t.register.submit}
            onPress={register}
            loading={loading}
            disabled={!email.trim() || !password || !repeat}
          />
          <View style={styles.login}>
            <ThemedText type="small" themeColor="textSecondary">
              {t.register.haveAccount}
            </ThemedText>
            <TextLink title={t.register.signIn} onPress={() => router.back()} />
          </View>
          <LegalLinks />
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
  notice: {
    textAlign: 'center',
  },
  login: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
