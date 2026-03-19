export interface CodeLabelOption {
  code: string;
  label: string;
}

export const MARKET_CURRENCY_OPTIONS: CodeLabelOption[] = [
  { code: "USD", label: "USD - US Dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - British Pound" },
  { code: "CAD", label: "CAD - Canadian Dollar" },
  { code: "AUD", label: "AUD - Australian Dollar" },
  { code: "JPY", label: "JPY - Japanese Yen" },
  { code: "CNY", label: "CNY - Chinese Yuan" },
  { code: "MXN", label: "MXN - Mexican Peso" },
  { code: "BRL", label: "BRL - Brazilian Real" },
];

export const MARKET_TIMEZONE_OPTIONS: CodeLabelOption[] = [
  { code: "UTC", label: "UTC" },
  { code: "America/New_York", label: "America/New_York" },
  { code: "America/Chicago", label: "America/Chicago" },
  { code: "America/Denver", label: "America/Denver" },
  { code: "America/Los_Angeles", label: "America/Los_Angeles" },
  { code: "America/Mexico_City", label: "America/Mexico_City" },
  { code: "America/Sao_Paulo", label: "America/Sao_Paulo" },
  { code: "Europe/London", label: "Europe/London" },
  { code: "Europe/Paris", label: "Europe/Paris" },
  { code: "Asia/Tokyo", label: "Asia/Tokyo" },
  { code: "Asia/Shanghai", label: "Asia/Shanghai" },
  { code: "Australia/Sydney", label: "Australia/Sydney" },
];

const ALLOWED_CURRENCY_CODES = new Set(
  MARKET_CURRENCY_OPTIONS.map((item) => item.code)
);
const ALLOWED_TIMEZONE_CODES = new Set(
  MARKET_TIMEZONE_OPTIONS.map((item) => item.code)
);

export function isSupportedMarketCurrency(code: string): boolean {
  return ALLOWED_CURRENCY_CODES.has(code.trim().toUpperCase());
}

export function isSupportedMarketTimezone(code: string): boolean {
  return ALLOWED_TIMEZONE_CODES.has(code.trim());
}
