/**
 * Returns the short language name from a full locale name.
 * "English (United States)" → "English"
 * "French (France)" → "French"
 * "Chinese (Simplified)" → "Chinese (Simplified)" (preserved — no shorter plain-language form)
 */
export function getLocaleShortName(name: string): string {
  const parenIndex = name.indexOf(' (')
  return parenIndex > 0 ? name.slice(0, parenIndex) : name
}

/**
 * Returns the display name for a locale within a list of visible locales.
 * When two locales share the same short name (e.g. "English (US)" and "English (UK)"
 * in the same market), falls back to the full locale name to disambiguate.
 */
export function getLocaleDisplayName(
  locale: { name: string },
  visibleLocales: Array<{ name: string }>
): string {
  const shortName = getLocaleShortName(locale.name)
  const hasDuplicate = visibleLocales.filter(
    (l) => getLocaleShortName(l.name) === shortName
  ).length > 1
  return hasDuplicate ? locale.name : shortName
}
