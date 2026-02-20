type TranslationProvider = 'deepl';

const DEEPL_LOCALE_OVERRIDES: Record<string, string> = {
  'en-gb': 'EN-GB',
  'en-us': 'EN-US',
  'pt-br': 'PT-BR',
  'pt-pt': 'PT-PT',
  'zh-cn': 'ZH',
  'zh-hk': 'ZH',
  'zh-tw': 'ZH',
  'es-mx': 'ES',
  'es-es': 'ES',
  'es-ar': 'ES',
  'es-co': 'ES',
  'es-cl': 'ES',
  'es-pe': 'ES'
};

export function mapLocaleToTranslationCode(
  localeCode: string,
  provider: TranslationProvider = 'deepl'
): string {
  const normalized = localeCode.trim().toLowerCase();

  if (provider === 'deepl') {
    if (DEEPL_LOCALE_OVERRIDES[normalized]) {
      return DEEPL_LOCALE_OVERRIDES[normalized];
    }

    const language = normalized.split('-')[0]?.toUpperCase();
    return language || normalized.toUpperCase();
  }

  return localeCode;
}
