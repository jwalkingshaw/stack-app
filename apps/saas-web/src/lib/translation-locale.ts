import { normalizeLocaleCode } from "@/lib/locale-code";

type TranslationProvider = 'deepl';

export const DEEPL_LOCALE_OVERRIDES: Record<string, string> = {
  'en-gb': 'EN-GB',
  'en-us': 'EN-US',
  'en-ca': 'EN',
  'en-au': 'EN',
  'es-us': 'ES',
  'pt-br': 'PT-BR',
  'pt-pt': 'PT-PT',
  'fr-ca': 'FR',
  'fr-fr': 'FR',
  'de-de': 'DE',
  'it-it': 'IT',
  'nl-nl': 'NL',
  'sv-se': 'SV',
  'da-dk': 'DA',
  'nb-no': 'NB',
  'fi-fi': 'FI',
  'pl-pl': 'PL',
  'cs-cz': 'CS',
  'ro-ro': 'RO',
  'hu-hu': 'HU',
  'tr-tr': 'TR',
  'el-gr': 'EL',
  'ja-jp': 'JA',
  'ko-kr': 'KO',
  'zh-cn': 'ZH',
  'zh-hk': 'ZH',
  'zh-tw': 'ZH',
  'ar-sa': 'AR',
  'he-il': 'HE',
  'hi-in': 'HI',
  'id-id': 'ID',
  'ms-my': 'MS',
  'th-th': 'TH',
  'vi-vn': 'VI',
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
  const normalized = normalizeLocaleCode(localeCode).toLowerCase();

  if (provider === 'deepl') {
    if (DEEPL_LOCALE_OVERRIDES[normalized]) {
      return DEEPL_LOCALE_OVERRIDES[normalized];
    }

    const language = normalized.split('-')[0]?.toUpperCase();
    return language || localeCode.trim().toUpperCase();
  }

  return localeCode;
}
