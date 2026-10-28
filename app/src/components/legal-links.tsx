import { StyleSheet, View } from 'react-native';

import { TextLink } from '@/components/text-link';
import { Spacing } from '@/constants/theme';
import { openLegalPage, type LegalPage } from '@/lib/legal';
import { useSettings } from '@/lib/settings';

const PAGES: LegalPage[] = ['terms', 'privacy', 'deleteAccount'];

/** Links to the terms, privacy policy and account deletion pages on the web portal. */
export function LegalLinks() {
  const { t, uiLanguageCode } = useSettings();
  return (
    <View style={styles.links}>
      {PAGES.map((page) => (
        <TextLink key={page} title={t.legal[page]} onPress={() => openLegalPage(page, uiLanguageCode)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: Spacing.three,
    rowGap: Spacing.two,
  },
});
