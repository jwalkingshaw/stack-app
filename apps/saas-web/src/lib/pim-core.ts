export const CORE_BASIC_INFO_GROUP_CODE = 'basic_info';
export const CORE_DOCUMENTATION_GROUP_CODE = 'documentation';
export const CORE_SERVING_INFO_GROUP_CODE = 'serving_info';

export const CORE_SYSTEM_FIELD_CODES = [
  'title',
  'brand_name',
  'scin',
  'sku',
  'barcode',
  'coa_documents',
  'coc_documents',
  'label_panel_documents',
  'spec_sheet_documents',
  'sell_sheet_documents',
  'supporting_documents',
  'legal_documents',
  'sfp_documents',
  'manufacturer_name',
] as const;

// Serving & Packaging — regulatory/label required physical product attributes
export const SERVING_INFO_SYSTEM_FIELD_CODES = [
  'dose_form',
  'unit_count',
  'package_type',
  'serving_size',
  'servings_per_container',
  'net_weight',
  'net_volume',
] as const;

// Compliance group additions — regulatory label requirements
export const COMPLIANCE_EXPANSION_SYSTEM_FIELD_CODES = [
  'key_actives',
  'allergen_statement',
  'directions_for_use',
  'warnings',
  'storage_conditions',
  'country_of_origin',
  'certifications',
] as const;

// System fields that remain base product truth and should never expose locale authoring.
export const BASE_ONLY_SYSTEM_FIELD_CODES = [
  'ingredients',
  'other_ingredients',
] as const;

export const RESERVED_SYSTEM_FIELD_CODES = [
  'facts_panel',
  ...BASE_ONLY_SYSTEM_FIELD_CODES,
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

export const isBaseOnlySystemFieldCode = (code: string | null | undefined): boolean =>
  BASE_ONLY_SYSTEM_FIELD_CODES.includes(
    toNormalizedCode(code) as (typeof BASE_ONLY_SYSTEM_FIELD_CODES)[number]
  );
