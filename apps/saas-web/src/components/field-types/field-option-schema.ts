'use client';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

type BooleanDisplayStyle = 'checkbox' | 'toggle' | 'radio';
const BOOLEAN_DISPLAY_STYLES: BooleanDisplayStyle[] = ['checkbox', 'toggle', 'radio'];

export type CanonicalBooleanFieldOptions = {
  display_style: BooleanDisplayStyle;
  true_label: string;
  false_label: string;
  default_value: boolean;
};

export function normalizeBooleanFieldOptions(input: unknown): CanonicalBooleanFieldOptions {
  const record = asRecord(input);
  const styleCandidate = asString(record.display_style ?? record.displayStyle, 'checkbox');
  const displayStyle = BOOLEAN_DISPLAY_STYLES.includes(styleCandidate as BooleanDisplayStyle)
    ? (styleCandidate as BooleanDisplayStyle)
    : 'checkbox';

  return {
    display_style: displayStyle,
    true_label: asString(record.true_label ?? record.trueLabel, 'Yes'),
    false_label: asString(record.false_label ?? record.falseLabel, 'No'),
    default_value: asBoolean(record.default_value ?? record.defaultValue, false),
  };
}

type DateFormat = 'date' | 'datetime' | 'time';
const DATE_FORMATS: DateFormat[] = ['date', 'datetime', 'time'];

export type CanonicalDateFieldOptions = {
  format: DateFormat;
  min_date: string;
  max_date: string;
  default_to_today: boolean;
};

export function normalizeDateFieldOptions(input: unknown): CanonicalDateFieldOptions {
  const record = asRecord(input);
  const formatCandidate = asString(record.format);
  const includeTime = asBoolean(record.include_time, false);
  const format = DATE_FORMATS.includes(formatCandidate as DateFormat)
    ? (formatCandidate as DateFormat)
    : includeTime
    ? 'datetime'
    : 'date';

  return {
    format,
    min_date: asString(record.min_date ?? record.minDate),
    max_date: asString(record.max_date ?? record.maxDate),
    default_to_today: asBoolean(record.default_to_today ?? record.defaultToToday, false),
  };
}

export type CanonicalNumberFieldOptions = {
  min_value?: number;
  max_value?: number;
  step: number;
  decimal_places: number;
  allow_negative: boolean;
  unit: string;
};

export function normalizeNumberFieldOptions(input: unknown): CanonicalNumberFieldOptions {
  const record = asRecord(input);
  const minValue = asNumber(record.min_value ?? record.min);
  const maxValue = asNumber(record.max_value ?? record.max);
  const step = asNumber(record.step) ?? 1;
  const decimalPlaces = asNumber(record.decimal_places ?? record.decimals) ?? 0;

  return {
    min_value: minValue,
    max_value: maxValue,
    step,
    decimal_places: Math.max(0, Math.min(10, Math.round(decimalPlaces))),
    allow_negative: asBoolean(record.allow_negative ?? record.allowNegative, false),
    unit: asString(record.unit),
  };
}

export type CanonicalTextAreaFieldOptions = {
  rows: number;
  min_length?: number;
  max_length?: number;
  auto_resize: boolean;
  rich_text: boolean;
  strip_formatting_on_paste: boolean;
};

export function normalizeTextAreaFieldOptions(input: unknown): CanonicalTextAreaFieldOptions {
  const record = asRecord(input);
  const rows = asNumber(record.rows) ?? 4;
  const minLength = asNumber(record.min_length ?? record.minLength);
  const maxLength = asNumber(record.max_length ?? record.maxLength);

  return {
    rows: Math.max(2, Math.min(20, Math.round(rows))),
    min_length: minLength,
    max_length: maxLength,
    auto_resize: asBoolean(record.auto_resize ?? record.autoResize, true),
    rich_text: asBoolean(record.rich_text ?? record.richText, false),
    strip_formatting_on_paste: asBoolean(
      record.strip_formatting_on_paste ??
        record.stripFormattingOnPaste ??
        record.remove_html_formatting_on_paste ??
        record.removeHtmlFormattingOnPaste,
      true
    ),
  };
}
