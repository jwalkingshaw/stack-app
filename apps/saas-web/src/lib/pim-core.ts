export const CORE_BASIC_INFO_GROUP_CODE = 'basic_info';
export const CORE_DOCUMENTATION_GROUP_CODE = 'documentation';
export const CORE_SERVING_INFO_GROUP_CODE = 'serving_info';

export const CORE_SYSTEM_FIELD_CODES = [
  'title',
  'scin',
  'sku',
  'barcode',
  'coa_documents',
  'legal_documents',
  'sfp_documents',
] as const;

// Serving & Packaging — regulatory/label required physical product attributes
export const SERVING_INFO_SYSTEM_FIELD_CODES = [
  'dose_form',
  'serving_size',
  'servings_per_container',
  'net_weight',
  'net_volume',
] as const;

// Compliance group additions — regulatory label requirements
export const COMPLIANCE_EXPANSION_SYSTEM_FIELD_CODES = [
  'key_actives',
  'directions_for_use',
  'warnings',
  'storage_conditions',
  'country_of_origin',
  'certifications',
] as const;

export const RESERVED_SYSTEM_FIELD_CODES = [
  'facts_panel',
  'ingredients',
  'other_ingredients',
  ...SERVING_INFO_SYSTEM_FIELD_CODES,
  ...COMPLIANCE_EXPANSION_SYSTEM_FIELD_CODES,
  ...CORE_SYSTEM_FIELD_CODES,
] as const;

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
