import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { authErrorMessage, useAuth } from '@/lib/auth';
import { useT } from '@/lib/settings';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { resetPassword } = useAuth();
  const t = useT();
  const [email, setEmail] = useState(params.email ?? '');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email);
      setSentTo(email.trim());
    } catch (e) {
      setError(authErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {sentTo ? (
            <>
              {/* Firebase does not reveal whether the address has an account, so neither do we. */}
              <ThemedText>{t.forgotPassword.sent(sentTo)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t.forgotPassword.sentHint}
              </ThemedText>
              <Button title={t.forgotPassword.backToLogin} onPress={() => router.back()} />
            </>
          ) : (
            <>
              <ThemedText themeColor="textSecondary">{t.forgotPassword.intro}</ThemedText>
              <Field
                label={t.common.email}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                onSubmitEditing={send}
              />
              {error && (
                <ThemedText type="small" themeColor="danger">
                  {error}
                </ThemedText>
              )}
              <Button title={t.forgotPassword.send} onPress={send} loading={loading} disabled={!email.trim()} />
            </>
          )}
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
