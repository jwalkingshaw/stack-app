export const CORE_BASIC_INFO_GROUP_CODE = 'basic_info';
export const CORE_DOCUMENTATION_GROUP_CODE = 'documentation';

export const CORE_SYSTEM_FIELD_CODES = [
  'title',
  'scin',
  'sku',
  'barcode',
  'coa_documents',
  'legal_documents',
  'sfp_documents',
] as const;

export const RESERVED_SYSTEM_FIELD_CODES = ['facts_panel', ...CORE_SYSTEM_FIELD_CODES] as const;

const toNormalizedCode = (value: string | null | undefined): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

export const isCoreBasicInfoGroupCode = (code: string | null | undefined): boolean =>
  toNormalizedCode(code) === CORE_BASIC_INFO_GROUP_CODE;

export const isCoreSystemFieldCode = (code: string | null | undefined): boolean =>
  CORE_SYSTEM_FIELD_CODES.includes(toNormalizedCode(code) as (typeof CORE_SYSTEM_FIELD_CODES)[number]);

export const isReservedSystemFieldCode = (code: string | null | undefined): boolean =>
  RESERVED_SYSTEM_FIELD_CODES.includes(
    toNormalizedCode(code) as (typeof RESERVED_SYSTEM_FIELD_CODES)[number]
  );
