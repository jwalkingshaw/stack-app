export interface LocaleCatalogEntry {
  code: string;
  name: string;
  sort_order?: number;
}

export const DEFAULT_LOCALE_CATALOG: LocaleCatalogEntry[] = [
  { code: "en-US", name: "English (United States)", sort_order: 10 },
  { code: "en-GB", name: "English (United Kingdom)", sort_order: 20 },
  { code: "en-CA", name: "English (Canada)", sort_order: 30 },
  { code: "en-AU", name: "English (Australia)", sort_order: 40 },
  { code: "es-ES", name: "Spanish (Spain)", sort_order: 50 },
  { code: "es-MX", name: "Spanish (Mexico)", sort_order: 60 },
  { code: "es-US", name: "Spanish (United States)", sort_order: 70 },
  { code: "pt-BR", name: "Portuguese (Brazil)", sort_order: 80 },
  { code: "pt-PT", name: "Portuguese (Portugal)", sort_order: 90 },
  { code: "fr-FR", name: "French (France)", sort_order: 100 },
  { code: "fr-CA", name: "French (Canada)", sort_order: 110 },
  { code: "de-DE", name: "German (Germany)", sort_order: 120 },
  { code: "it-IT", name: "Italian (Italy)", sort_order: 130 },
  { code: "nl-NL", name: "Dutch (Netherlands)", sort_order: 140 },
  { code: "sv-SE", name: "Swedish (Sweden)", sort_order: 150 },
  { code: "da-DK", name: "Danish (Denmark)", sort_order: 160 },
  { code: "nb-NO", name: "Norwegian Bokmal (Norway)", sort_order: 170 },
  { code: "fi-FI", name: "Finnish (Finland)", sort_order: 180 },
  { code: "pl-PL", name: "Polish (Poland)", sort_order: 190 },
  { code: "cs-CZ", name: "Czech (Czechia)", sort_order: 200 },
  { code: "ro-RO", name: "Romanian (Romania)", sort_order: 210 },
  { code: "hu-HU", name: "Hungarian (Hungary)", sort_order: 220 },
  { code: "tr-TR", name: "Turkish (Turkiye)", sort_order: 230 },
  { code: "el-GR", name: "Greek (Greece)", sort_order: 240 },
  { code: "ja-JP", name: "Japanese (Japan)", sort_order: 250 },
  { code: "ko-KR", name: "Korean (South Korea)", sort_order: 260 },
  { code: "zh-CN", name: "Chinese (Simplified)", sort_order: 270 },
  { code: "zh-TW", name: "Chinese (Traditional)", sort_order: 280 },
  { code: "ar-SA", name: "Arabic (Saudi Arabia)", sort_order: 290 },
  { code: "he-IL", name: "Hebrew (Israel)", sort_order: 300 },
  { code: "hi-IN", name: "Hindi (India)", sort_order: 310 },
  { code: "id-ID", name: "Indonesian (Indonesia)", sort_order: 320 },
  { code: "ms-MY", name: "Malay (Malaysia)", sort_order: 330 },
  { code: "th-TH", name: "Thai (Thailand)", sort_order: 340 },
  { code: "vi-VN", name: "Vietnamese (Vietnam)", sort_order: 350 },
];
