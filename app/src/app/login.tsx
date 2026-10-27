import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { TextLink } from '@/components/text-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage, useAuth } from '@/lib/auth';
import { useT } from '@/lib/settings';

export default function LoginScreen() {
  const theme = useTheme();
  const t = useT();
  const { signIn, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'email' | 'google', action: () => Promise<void>) {
    setLoading(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(authErrorMessage(e, t));
    } finally {
      setLoading(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle" style={styles.center}>
              VocabSprint
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {t.login.tagline}
            </ThemedText>

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
              label={t.common.password}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={() => run('email', () => signInWithEmail(email, password))}
            />
            <View style={styles.forgot}>
              <TextLink
                title={t.login.forgotPassword}
                onPress={() => router.push({ pathname: '/forgot-password', params: { email } })}
              />
            </View>
            <Button
              title={t.login.signIn}
              onPress={() => run('email', () => signInWithEmail(email, password))}
              loading={loading === 'email'}
              disabled={!email.trim() || !password || loading !== null}
            />

            {error && (
              <ThemedText type="small" themeColor="danger" style={styles.center}>
                {error}
              </ThemedText>
            )}

            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: theme.border }]} />
              <ThemedText type="small" themeColor="textSecondary">
                {t.login.or}
              </ThemedText>
              <View style={[styles.line, { backgroundColor: theme.border }]} />
            </View>

            <Button
              title={t.login.google}
              variant="secondary"
              onPress={() => run('google', signIn)}
              loading={loading === 'google'}
              disabled={loading !== null}
            />

            <View style={styles.register}>
              <ThemedText type="small" themeColor="textSecondary">
                {t.login.noAccount}
              </ThemedText>
              <TextLink title={t.login.createAccount} onPress={() => router.push('/register')} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
  forgot: {
    alignItems: 'flex-end',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  register: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
