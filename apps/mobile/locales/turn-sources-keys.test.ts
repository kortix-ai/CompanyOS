import { describe, expect, test } from 'bun:test';
import i18next from 'i18next';

import { SUPPORTED_LOCALES } from '@/lib/utils/locale-config';

// "N sources" under an answer resolves in every locale from its own bundle, with the count in it.

async function instanceFor(locale: string) {
  const i18n = i18next.createInstance();
  await i18n.init({
    resources: {
      en: { translation: require('./en.json') },
      [locale]: { translation: require(`./${locale}.json`) },
    },
    lng: locale,
    fallbackLng: 'en',
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false },
  });
  return i18n;
}

describe('turn sources strings', () => {
  test('English counts one source and several sources', async () => {
    const en = await instanceFor('en');
    expect(en.t('sessions.turnSources', { count: 1 })).toBe('1 source');
    expect(en.t('sessions.turnSources', { count: 3 })).toBe('3 sources');
  });

  for (const locale of SUPPORTED_LOCALES.filter((locale) => locale !== 'en')) {
    test(`${locale} has its own translation with the count in it`, async () => {
      const i18n = await instanceFor(locale);
      expect(i18n.exists('sessions.turnSources_other', { lng: locale, fallbackLng: false })).toBe(true);
      expect(i18n.t('sessions.turnSources', { count: 3 })).toContain('3');
    });
  }
});
