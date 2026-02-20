// Backend validation for product data against field configurations

import { supabaseServer } from '@/lib/supabase';
import { ProductField, validateProductData, ValidationResult } from '@/lib/field-validation';

const isPlainObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isEmptyComposite = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
};

const buildUniqueCheckValue = (
  fieldType: string,
  value: any
): { column: 'value_text' | 'value_number' | 'value_boolean' | 'value_date' | 'value_datetime' | 'value_json'; value: any } | null => {
  if (value === null || value === undefined) return null;

  switch (fieldType) {
    case 'text':
    case 'textarea':
    case 'select':
    case 'identifier':
    case 'url': {
      if (typeof value === 'string' && value.trim() === '') return null;
      return { column: 'value_text', value: String(value) };
    }
    case 'number':
    case 'decimal': {
      if (value === '') return null;
      const numericValue = Number(value);
      if (Number.isNaN(numericValue)) return null;
      return { column: 'value_number', value: numericValue };
    }
    case 'boolean': {
      if (typeof value !== 'boolean') return null;
      return { column: 'value_boolean', value };
    }
    case 'date': {
      if (value === '') return null;
      return { column: 'value_date', value };
    }
    case 'datetime': {
      if (value === '') return null;
      return { column: 'value_datetime', value };
    }
    case 'multiselect':
    case 'multi_select': {
      if (Array.isArray(value)) {
        if (value.length === 0) return null;
        return { column: 'value_json', value };
      }
      return { column: 'value_json', value: [value] };
    }
    case 'table': {
      if (!Array.isArray(value) || value.length === 0) return null;
      return { column: 'value_json', value };
    }
    case 'measurement':
    case 'price':
    case 'file':
    case 'image': {
      if (isEmptyComposite(value)) return null;
      return { column: 'value_json', value };
    }
    default: {
      if (isEmptyComposite(value)) return null;
      return { column: 'value_json', value };
    }
  }
};

const formatUniqueValue = (value: any): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Fetch product fields for an organization
 */
export async function getProductFieldsForOrganization(organizationId: string): Promise<ProductField[]> {
  const { data: fields, error } = await supabaseServer
    .from('product_fields')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching product fields:', error);
    throw new Error('Failed to fetch product fields');
  }

  return fields || [];
}

/**
 * Validate product data against organization's field configurations
 */
export async function validateProductDataForOrganization(
  productData: Record<string, any>,
  organizationId: string,
  excludeFields: string[] = []
): Promise<ValidationResult> {
  try {
    // Fetch field configurations
    const fields = await getProductFieldsForOrganization(organizationId);

    // Filter out excluded fields (like system fields)
    const fieldsToValidate = fields.filter(field => !excludeFields.includes(field.code));

    // Validate the data
    const result = validateProductData(productData, fieldsToValidate);

    return result;
  } catch (error) {
    console.error('Error validating product data:', error);
    return {
      isValid: false,
      errors: [{
        field: 'validation',
        message: 'Failed to validate product data',
        code: 'VALIDATION_ERROR'
      }]
    };
  }
}

/**
 * Check for unique field violations
 */
export async function checkUniqueFieldViolations(
  productData: Record<string, any>,
  organizationId: string,
  productId?: string // Exclude this product ID when updating
): Promise<ValidationResult> {
  try {
    const fields = await getProductFieldsForOrganization(organizationId);
    const uniqueFields = fields.filter(field => field.is_unique);

    const errors = [];

    for (const field of uniqueFields) {
      const value = productData[field.code];
      const normalized = buildUniqueCheckValue(field.field_type, value);

      if (!normalized) {
        continue;
      }

      let query = supabaseServer
        .from('product_field_values')
        .select('id')
        .eq('product_field_id', field.id)
        .eq(normalized.column, normalized.value)
        .is('locale', null)
        .is('channel', null);

      if (productId) {
        query = query.neq('product_id', productId);
      }

      const { data: existing } = await query.single();

      if (existing) {
        errors.push({
          field: field.code,
          message: `${field.name} "${formatUniqueValue(normalized.value)}" is already in use`,
          code: 'UNIQUE_VIOLATION'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('Error checking unique fields:', error);
    return {
      isValid: false,
      errors: [{
        field: 'uniqueness',
        message: 'Failed to check unique field constraints',
        code: 'UNIQUENESS_CHECK_ERROR'
      }]
    };
  }
}

/**
 * Comprehensive product validation combining field and uniqueness checks
 */
export async function validateProductForOrganization(
  productData: Record<string, any>,
  organizationId: string,
  productId?: string,
  options: {
    excludeFields?: string[];
    skipUniqueCheck?: boolean;
  } = {}
): Promise<ValidationResult> {
  const { excludeFields = [], skipUniqueCheck = false } = options;

  // System fields that shouldn't be validated against custom field rules
  const systemFields = [
    'id', 'organization_id', 'created_at', 'updated_at', 'created_by',
    'type', 'parent_id', 'status', 'launch_date', 'msrp', 'cost_of_goods',
    'margin_percent', 'weight_g', 'dimensions', 'inheritance', 'is_inherited',
    'marketplace_content', 'variant_axis', 'features', 'specifications',
    'meta_title', 'meta_description', 'keywords',
    'sku', 'product_name', 'barcode', 'brand_line', 'family_id', // Core product fields
    'short_description', 'long_description'
  ];

  const allExcludeFields = [...systemFields, ...excludeFields];

  // Validate against field configurations
  const fieldValidation = await validateProductDataForOrganization(
    productData,
    organizationId,
    allExcludeFields
  );

  if (!fieldValidation.isValid) {
    return fieldValidation;
  }

  // Check unique constraints
  if (!skipUniqueCheck) {
    const uniqueValidation = await checkUniqueFieldViolations(
      productData,
      organizationId,
      productId
    );

    if (!uniqueValidation.isValid) {
      return {
        isValid: false,
        errors: [...fieldValidation.errors, ...uniqueValidation.errors]
      };
    }
  }

  return fieldValidation;
}

/**
 * Extract custom field data from product data
 */
export async function extractCustomFieldData(
  productData: Record<string, any>,
  organizationId: string
): Promise<Record<string, any>> {
  const fields = await getProductFieldsForOrganization(organizationId);
  const customFieldData: Record<string, any> = {};

  for (const field of fields) {
    if (productData.hasOwnProperty(field.code)) {
      customFieldData[field.code] = productData[field.code];
    }
  }

  return customFieldData;
}

/**
 * Format validation errors for API response
 */
export function formatValidationErrorsForAPI(errors: Array<{ field: string; message: string; code: string }>) {
  return {
    error: 'Validation failed',
    details: errors.map(err => ({
      field: err.field,
      message: err.message,
      code: err.code
    }))
  };
}
