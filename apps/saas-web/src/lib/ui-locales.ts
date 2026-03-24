export const SUPPORTED_UI_LOCALES = ["en-US", "es-MX"] as const;
export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = "en-US";
export const UI_LOCALE_COOKIE_NAME = "tt_locale";

export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
  "en-US": "English (US)",
  "es-MX": "Español (Latinoamérica)",
};

const SUPPORTED_SET = new Set<string>(
  SUPPORTED_UI_LOCALES.map((locale) => locale.toLowerCase())
);

function normalizeRawLocale(value: string): string {
  return value.trim().replace("_", "-");
}

function canonicalize(locale: string): UiLocale | null {
  const normalized = normalizeRawLocale(locale);
  const lower = normalized.toLowerCase();
  if (SUPPORTED_SET.has(lower)) {
    return SUPPORTED_UI_LOCALES.find((entry) => entry.toLowerCase() === lower) ?? null;
  }

  const language = lower.split("-")[0];
  if (language === "en") return "en-US";
  if (language === "es") return "es-MX";
  return null;
}

export function normalizeUiLocale(value: unknown): UiLocale | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return canonicalize(trimmed);
}

function parseAcceptLanguage(acceptLanguageHeader: string): string[] {
  return acceptLanguageHeader
    .split(",")
    .map((part) => {
      const [rawLocale, qPart] = part.split(";").map((entry) => entry.trim());
      if (!rawLocale) return null;
      const q = qPart?.startsWith("q=") ? Number.parseFloat(qPart.slice(2)) : 1;
      return {
        locale: rawLocale,
        quality: Number.isFinite(q) ? q : 1,
      };
    })
    .filter((entry): entry is { locale: string; quality: number } => Boolean(entry))
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.locale);
}

export function resolveLocaleFromAcceptLanguage(headerValue: string | null): UiLocale | null {
  if (!headerValue || headerValue.trim().length === 0) return null;
  const orderedLocales = parseAcceptLanguage(headerValue);
  for (const candidate of orderedLocales) {
    const resolved = normalizeUiLocale(candidate);
    if (resolved) return resolved;
  }
  return null;
}

export function isSupportedUiLocale(value: unknown): value is UiLocale {
  return normalizeUiLocale(value) !== null;
}
