export const BASIC_INFORMATION_FIELD_GROUP_CODE = 'basic_information';
export const BASIC_INFORMATION_FIELD_GROUP_LEGACY_CODE = 'basic_info';
export const DOCUMENTATION_FIELD_GROUP_CODE = 'documentation';

const FIELD_GROUP_CODE_ALIASES = new Map<string, string>([
  [BASIC_INFORMATION_FIELD_GROUP_LEGACY_CODE, BASIC_INFORMATION_FIELD_GROUP_CODE],
]);

export function normalizeFieldGroupCode(code: unknown): string {
  if (typeof code !== 'string') return '';
  const normalized = code.trim().toLowerCase();
  return FIELD_GROUP_CODE_ALIASES.get(normalized) || normalized;
}

export function isBasicInformationFieldGroupCode(code: unknown): boolean {
  const normalized = normalizeFieldGroupCode(code);
  return normalized === BASIC_INFORMATION_FIELD_GROUP_CODE;
}

export function isLockedFieldGroupCode(code: unknown): boolean {
  const normalized = normalizeFieldGroupCode(code);
  return normalized === BASIC_INFORMATION_FIELD_GROUP_CODE || normalized === DOCUMENTATION_FIELD_GROUP_CODE;
}
