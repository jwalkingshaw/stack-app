export interface Locale {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface Country {
  code: string;
  name: string;
}

export interface Market {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
  currency_code: string | null;
  timezone: string | null;
  default_locale_id: string | null;
}

export interface MarketLocaleAssignment {
  id: string;
  market_id: string;
  locale_id: string;
  is_active: boolean;
}

export interface MarketCountryAssignment {
  id: string;
  market_id: string;
  country_code: string;
  is_active: boolean;
}

export interface ReferenceOption {
  code: string;
  label: string;
}

export interface LocaleCatalogEntry {
  code: string;
  name: string;
  sort_order?: number;
}

export interface ReferenceDataResponse {
  countries: Country[];
  currencies: ReferenceOption[];
  timezones: ReferenceOption[];
  locale_catalog: LocaleCatalogEntry[];
}

export interface CreateMarketPayload {
  name: string;
  code?: string;
  country_codes: string[];
  locale_ids: string[];
  default_locale_id: string;
  currency_code?: string | null;
  timezone?: string | null;
}

export interface CreateMarketDraft {
  name: string;
  code?: string;
  country_codes: string[];
  locale_ids: string[];
  default_locale_id: string;
  currency_code?: string | null;
  timezone?: string | null;
}

export const NONE_OPTION = "__none__";
export const DIALOG_FORM_WIDTH_CLASS = "mx-auto w-full max-w-4xl";

export const toMarketCode = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

export function toMap<T extends Record<K, string>, K extends keyof T>(
  rows: T[],
  key: K
): Map<string, T> {
  return new Map(rows.map((row) => [row[key], row]));
}
