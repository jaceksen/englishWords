import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ButtonBorder, Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchLatestAppVersion, getInstalledAppVersion, isNewerVersion, PLAY_STORE_URL } from '@/lib/app-version';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/settings';

// Checked ONCE per process (cold start): signing in again in the same session doesn't show it twice.
let checked = false;

/**
 * New version notice (Android only, signed-in only): compares the installed version with
 * `settings/appversion.version` in Firestore. Errors and offline are silent.
 */
export function UpdateNotice() {
  const t = useT();
  const { user } = useAuth();
  const scheme = useColorScheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !user || checked) return;
    checked = true;
    const installed = getInstalledAppVersion();
    if (!installed) return;
    fetchLatestAppVersion()
      .then((latest) => {
        if (latest && isNewerVersion(latest, installed)) setVisible(true);
      })
      .catch(() => undefined);
  }, [user]);

  const close = () => setVisible(false);
  const update = () => {
    setVisible(false);
    Linking.openURL(PLAY_STORE_URL).catch(() => undefined);
  };

  // The box uses the OPPOSITE theme to the app so it stands out.
  const colors = Colors[scheme === 'dark' ? 'light' : 'dark'];

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t.update.title}</Text>
          <Text style={[styles.message, { color: colors.text }]}>{t.update.message}</Text>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [
                styles.button,
                styles.outline,
                { borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
              ]}>
              <Text style={[styles.label, { color: colors.text }]}>{t.update.close}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={update}
              style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}>
              <Text style={[styles.label, { color: colors.onPrimary }]}>{t.update.update}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  box: {
    width: '100%',
    maxWidth: 384,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  title: { fontSize: 18, lineHeight: 26, fontWeight: 600, marginBottom: Spacing.three },
  message: { fontSize: 16, lineHeight: 24, marginBottom: Spacing.four },
  row: { flexDirection: 'row', gap: Spacing.three },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    ...ButtonBorder,
  },
  outline: { borderWidth: 1, backgroundColor: 'transparent' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: 700 },
});
