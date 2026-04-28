const LOCALE_CODE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function normalizeSubtag(subtag: string, index: number): string {
  if (index === 0) {
    return subtag.toLowerCase();
  }

  if (/^[A-Za-z]{4}$/.test(subtag)) {
    return `${subtag.slice(0, 1).toUpperCase()}${subtag.slice(1).toLowerCase()}`;
  }

  if (/^[A-Za-z]{2}$/.test(subtag) || /^\d{3}$/.test(subtag)) {
    return subtag.toUpperCase();
  }

  return subtag.toLowerCase();
}

export function normalizeLocaleCode(value: string): string {
  return value
    .trim()
    .replace(/_/g, "-")
    .replace(/-{2,}/g, "-")
    .split("-")
    .filter((part) => part.length > 0)
    .map((part, index) => normalizeSubtag(part, index))
    .join("-");
}

export function isValidLocaleCode(value: string): boolean {
  const normalized = normalizeLocaleCode(value);
  return normalized.length > 0 && LOCALE_CODE_PATTERN.test(normalized);
}

export function normalizeAndValidateLocaleCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeLocaleCode(value);
  return isValidLocaleCode(normalized) ? normalized : null;
}

