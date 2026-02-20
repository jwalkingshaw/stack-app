// Field validation utilities for both frontend and backend
import { validateBarcode } from '@/lib/barcode-utils';

export interface ProductField {
  id: string;
  code: string;
  name: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  options: Record<string, any>;
  validation_rules?: Record<string, any>;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a single field value against its configuration
 */
export function validateFieldValue(
  value: any,
  field: ProductField,
  allValues?: Record<string, any>
): ValidationResult {
  const errors: ValidationError[] = [];

  // Required field validation
  if (field.is_required && (value === null || value === undefined || value === '')) {
    errors.push({
      field: field.code,
      message: `${field.name} is required`,
      code: 'REQUIRED'
    });
    // If required field is empty, skip other validations
    return { isValid: false, errors };
  }

  // Skip validation if value is empty and field is not required
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  // Type-specific validations
  switch (field.field_type) {
    case 'text':
      validateTextField(value, field, errors);
      break;
    case 'textarea':
      validateTextAreaField(value, field, errors);
      break;
    case 'number':
      validateNumberField(value, field, errors);
      break;
    case 'identifier':
      validateIdentifierField(value, field, errors);
      break;
    case 'boolean':
      validateBooleanField(value, field, errors);
      break;
    case 'date':
      validateDateField(value, field, errors);
      break;
    case 'datetime':
      validateDateTimeField(value, field, errors);
      break;
    case 'select':
      validateSelectField(value, field, errors);
      break;
    case 'multiselect':
    case 'multi_select':
      validateMultiSelectField(value, field, errors);
      break;
    case 'measurement':
      validateMeasurementField(value, field, errors);
      break;
    case 'price':
      validatePriceField(value, field, errors);
      break;
    case 'file':
      validateFileField(value, field, errors);
      break;
    case 'image':
      validateImageField(value, field, errors);
      break;
    default:
      // Basic validation for other types
      break;
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validates multiple field values at once
 */
export function validateProductData(
  data: Record<string, any>,
  fields: ProductField[]
): ValidationResult {
  const allErrors: ValidationError[] = [];

  for (const field of fields) {
    const value = data[field.code];
    const result = validateFieldValue(value, field, data);
    allErrors.push(...result.errors);
  }

  return { isValid: allErrors.length === 0, errors: allErrors };
}

/**
 * Text field validation
 */
function validateTextField(value: any, field: ProductField, errors: ValidationError[]) {
  if (typeof value !== 'string') {
    errors.push({
      field: field.code,
      message: `${field.name} must be a text value`,
      code: 'INVALID_TYPE'
    });
    return;
  }

  const maxLength = field.options?.max_length || 255;
  if (value.length > maxLength) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot exceed ${maxLength} characters`,
      code: 'MAX_LENGTH_EXCEEDED'
    });
  }

  const minLength = field.options?.min_length || 0;
  if (value.length < minLength) {
    errors.push({
      field: field.code,
      message: `${field.name} must be at least ${minLength} characters`,
      code: 'MIN_LENGTH_NOT_MET'
    });
  }
}

/**
 * Text area field validation
 */
function validateTextAreaField(value: any, field: ProductField, errors: ValidationError[]) {
  if (typeof value !== 'string') {
    errors.push({
      field: field.code,
      message: `${field.name} must be a text value`,
      code: 'INVALID_TYPE'
    });
    return;
  }

  const maxLength = field.options?.max_length || 65535;
  if (value.length > maxLength) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot exceed ${maxLength} characters`,
      code: 'MAX_LENGTH_EXCEEDED'
    });
  }
}

/**
 * Number field validation
 */
function validateNumberField(value: any, field: ProductField, errors: ValidationError[]) {
  const numValue = Number(value);
  if (isNaN(numValue)) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid number`,
      code: 'INVALID_NUMBER'
    });
    return;
  }

  if (field.options?.min !== undefined && numValue < field.options.min) {
    errors.push({
      field: field.code,
      message: `${field.name} must be at least ${field.options.min}`,
      code: 'MIN_VALUE_NOT_MET'
    });
  }

  if (field.options?.max !== undefined && numValue > field.options.max) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot exceed ${field.options.max}`,
      code: 'MAX_VALUE_EXCEEDED'
    });
  }
}

/**
 * Identifier field validation
 */
function validateIdentifierField(value: any, field: ProductField, errors: ValidationError[]) {
  if (typeof value !== 'string') {
    errors.push({
      field: field.code,
      message: `${field.name} must be a text value`,
      code: 'INVALID_TYPE'
    });
    return;
  }

  // Identifiers should be alphanumeric with some special characters allowed
  const identifierPattern = /^[A-Za-z0-9\-_\.\s]+$/;
  if (!identifierPattern.test(value)) {
    errors.push({
      field: field.code,
      message: `${field.name} can only contain letters, numbers, spaces, hyphens, underscores, and periods`,
      code: 'INVALID_FORMAT'
    });
  }

  const maxLength = field.options?.max_length || 50;
  if (value.length > maxLength) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot exceed ${maxLength} characters`,
      code: 'MAX_LENGTH_EXCEEDED'
    });
  }

  const isBarcodeIdentifier =
    field.code === 'barcode' || field.options?.identifier_kind === 'barcode';

  if (isBarcodeIdentifier) {
    const barcodeResult = validateBarcode(value);
    if (!barcodeResult.isValid) {
      errors.push({
        field: field.code,
        message: barcodeResult.error || `${field.name} must be a valid GTIN/UPC/EAN barcode`,
        code: 'INVALID_BARCODE'
      });
    }
  }
}

/**
 * Measurement field validation
 */
function validateMeasurementField(value: any, field: ProductField, errors: ValidationError[]) {
  if (!value || typeof value !== 'object') {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid measurement`,
      code: 'INVALID_MEASUREMENT'
    });
    return;
  }

  if (field.options?.composite) {
    const componentSchema = Array.isArray(field.options.component_schema)
      ? field.options.component_schema.map((entry: any) => entry?.key).filter(Boolean)
      : Array.isArray(field.options.components)
      ? field.options.components
      : [];

    if (componentSchema.length === 0) {
      return;
    }

    const componentSource =
      value && typeof value === 'object' && value.components && typeof value.components === 'object'
        ? value.components
        : value;

    for (const componentKey of componentSchema) {
      const rawComponentValue = componentSource?.[componentKey];
      if (rawComponentValue === undefined || rawComponentValue === null || rawComponentValue === '') {
        continue;
      }

      let numericValue: number | null = null;
      if (typeof rawComponentValue === 'object') {
        const amount =
          rawComponentValue.amount ??
          rawComponentValue.value ??
          rawComponentValue.measurement ??
          rawComponentValue;
        if (amount === undefined || amount === null || amount === '') {
          continue;
        }
        const parsed = Number(amount);
        numericValue = Number.isNaN(parsed) ? null : parsed;
      } else {
        const parsed = Number(rawComponentValue);
        numericValue = Number.isNaN(parsed) ? null : parsed;
      }

      if (numericValue === null) {
        errors.push({
          field: field.code,
          message: `${field.name} ${componentKey} must be numeric`,
          code: 'INVALID_MEASUREMENT_COMPONENT'
        });
      } else if (!field.options?.allow_negative && numericValue < 0) {
        errors.push({
          field: field.code,
          message: `${field.name} ${componentKey} cannot be negative`,
          code: 'NEGATIVE_MEASUREMENT_COMPONENT'
        });
      }
    }
    return;
  }

  const amount = value.amount ?? value.value ?? value.measurement;
  if (amount === undefined || amount === null || amount === '') {
    errors.push({
      field: field.code,
      message: `${field.name} requires a value`,
      code: 'MISSING_MEASUREMENT_VALUE'
    });
    return;
  }

  const numValue = Number(amount);
  if (Number.isNaN(numValue)) {
    errors.push({
      field: field.code,
      message: `${field.name} must be numeric`,
      code: 'INVALID_MEASUREMENT_VALUE'
    });
    return;
  }

  if (!field.options?.allow_negative && numValue < 0) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot be negative`,
      code: 'NEGATIVE_MEASUREMENT'
    });
  }
}

function validatePriceField(value: any, field: ProductField, errors: ValidationError[]) {
  if (!value || typeof value !== 'object') {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid price`,
      code: 'INVALID_PRICE'
    });
    return;
  }

  const amount = value.amount ?? value.value ?? value.price;
  const currency = value.currency ?? value.code ?? value.unit;

  if (amount === undefined || amount === null || amount === '') {
    errors.push({
      field: field.code,
      message: `${field.name} requires an amount`,
      code: 'MISSING_PRICE_AMOUNT'
    });
  } else {
    const numAmount = Number(amount);
    if (Number.isNaN(numAmount)) {
      errors.push({
        field: field.code,
        message: `${field.name} amount must be numeric`,
        code: 'INVALID_PRICE_AMOUNT'
      });
    } else {
      if (!field.options?.allow_negative && numAmount < 0) {
        errors.push({
          field: field.code,
          message: `${field.name} cannot be negative`,
          code: 'NEGATIVE_PRICE_AMOUNT'
        });
      }
      if (field.options?.min_value !== undefined && numAmount < field.options.min_value) {
        errors.push({
          field: field.code,
          message: `${field.name} must be at least ${field.options.min_value}`,
          code: 'PRICE_BELOW_MIN'
        });
      }
      if (field.options?.max_value !== undefined && numAmount > field.options.max_value) {
        errors.push({
          field: field.code,
          message: `${field.name} must be less than or equal to ${field.options.max_value}`,
          code: 'PRICE_ABOVE_MAX'
        });
      }
    }
  }

  if (!currency) {
    errors.push({
      field: field.code,
      message: `${field.name} requires a currency`,
      code: 'MISSING_PRICE_CURRENCY'
    });
  } else if (
    Array.isArray(field.options?.allowed_currencies) &&
    field.options.allowed_currencies.length > 0 &&
    !field.options.allowed_currencies.includes(currency)
  ) {
    errors.push({
      field: field.code,
      message: `${currency} is not allowed for ${field.name}`,
      code: 'INVALID_PRICE_CURRENCY'
    });
  }
}

function validateBooleanField(value: any, field: ProductField, errors: ValidationError[]) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'boolean') {
    errors.push({
      field: field.code,
      message: `${field.name} must be true or false`,
      code: 'INVALID_BOOLEAN'
    });
  }
}

function validateDateField(value: any, field: ProductField, errors: ValidationError[]) {
  if (!value) return;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid date`,
      code: 'INVALID_DATE'
    });
  }
}

function validateDateTimeField(value: any, field: ProductField, errors: ValidationError[]) {
  if (!value) return;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid date/time`,
      code: 'INVALID_DATETIME'
    });
  }
}

function validateSelectField(value: any, field: ProductField, errors: ValidationError[]) {
  if (value === undefined || value === null || value === '') return;
  const options = field.options?.options?.map((opt: any) => opt.value) ?? [];
  if (options.length > 0 && !options.includes(value)) {
    errors.push({
      field: field.code,
      message: `${field.name} must be one of the available options`,
      code: 'INVALID_SELECT_OPTION'
    });
  }
}

function validateMultiSelectField(value: any, field: ProductField, errors: ValidationError[]) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push({
      field: field.code,
      message: `${field.name} must be an array of options`,
      code: 'INVALID_MULTISELECT_TYPE'
    });
    return;
  }

  const options = field.options?.options?.map((opt: any) => opt.value) ?? [];
  if (options.length === 0) return;

  const invalidValues = value.filter((val) => !options.includes(val));
  if (invalidValues.length > 0) {
    errors.push({
      field: field.code,
      message: `${field.name} contains invalid options: ${invalidValues.join(', ')}`,
      code: 'INVALID_MULTISELECT_OPTION'
    });
  }
}

function validateFileField(value: any, field: ProductField, errors: ValidationError[]) {
  if (value === null || value === undefined) return;
  const allowMultiple = !!field.options?.allow_multiple;
  const values = allowMultiple ? (Array.isArray(value) ? value : [value]) : [value];

  if (!Array.isArray(values)) {
    errors.push({
      field: field.code,
      message: `${field.name} must be an object or array of file references`,
      code: 'INVALID_FILE_VALUE'
    });
    return;
  }

  values.forEach((fileValue) => {
    if (!fileValue || typeof fileValue !== 'object') {
      errors.push({
        field: field.code,
        message: `${field.name} contains an invalid file reference`,
        code: 'INVALID_FILE_REFERENCE'
      });
      return;
    }

    const { assetId, filename, mimeType, size } = fileValue;
    if (!assetId) {
      errors.push({
        field: field.code,
        message: `${field.name} is missing an asset reference`,
        code: 'MISSING_FILE_ASSET'
      });
    }
    if (!filename) {
      errors.push({
        field: field.code,
        message: `${field.name} is missing a filename`,
        code: 'MISSING_FILE_NAME'
      });
    }
    if (!mimeType) {
      errors.push({
        field: field.code,
        message: `${field.name} is missing MIME type metadata`,
        code: 'MISSING_FILE_MIME'
      });
    } else if (
      Array.isArray(field.options?.allowed_mime_groups) &&
      field.options.allowed_mime_groups.length > 0
    ) {
      const allowed = field.options.allowed_mime_groups.some((group: string) => {
        switch (group) {
          case 'image':
            return /^image\//i.test(mimeType);
          case 'pdf':
            return /pdf/i.test(mimeType);
          case 'document':
            return /(word|text|ms-?word)/i.test(mimeType);
          case 'spreadsheet':
            return /(excel|sheet|spreadsheet|csv)/i.test(mimeType);
          case 'presentation':
            return /(powerpoint|presentation|ppt)/i.test(mimeType);
          case 'audio':
            return /^audio\//i.test(mimeType);
          case 'video':
            return /^video\//i.test(mimeType);
          case 'svg':
            return /svg/i.test(mimeType);
          case 'tiff':
            return /tiff/i.test(mimeType);
          case 'other':
            return true;
          default:
            return true;
        }
      });
      if (!allowed) {
        errors.push({
          field: field.code,
          message: `${field.name} contains a file with unsupported type (${mimeType})`,
          code: 'FILE_MIME_NOT_ALLOWED'
        });
      }
    }

    if (size !== undefined && size !== null && field.options?.max_size_mb) {
      const maxBytes = field.options.max_size_mb * 1024 * 1024;
      if (Number(size) > maxBytes) {
        errors.push({
          field: field.code,
          message: `${field.name} exceeds the maximum size of ${field.options.max_size_mb}MB`,
          code: 'FILE_SIZE_EXCEEDED'
        });
      }
    }
  });
}

function validateImageField(value: any, field: ProductField, errors: ValidationError[]) {
  if (value === null || value === undefined) return;
  const allowMultiple = !!field.options?.allow_multiple;
  const values = allowMultiple ? (Array.isArray(value) ? value : [value]) : [value];

  values.forEach((image) => {
    validateFileField(image, field, errors);
    if (!image || typeof image !== 'object') return;
    if (!image.mimeType || !/^image\//i.test(image.mimeType)) {
      errors.push({
        field: field.code,
        message: `${field.name} must reference an image file`,
        code: 'INVALID_IMAGE_TYPE'
      });
    }
    if ((field.options?.require_alt_text ?? true) && !image.altText) {
      errors.push({
        field: field.code,
        message: `${field.name} requires alt text`,
        code: 'MISSING_ALT_TEXT'
      });
    }
  });
}

/**
 * Get character count and limit for display
 */
export function getCharacterInfo(value: string, field: ProductField) {
  const currentLength = value?.length || 0;
  let maxLength: number;

  switch (field.field_type) {
    case 'text':
      maxLength = field.options?.max_length || 255;
      break;
    case 'textarea':
      maxLength = field.options?.max_length || 65535;
      break;
    case 'identifier':
      maxLength = field.options?.max_length || 50;
      break;
    default:
      maxLength = 255;
  }

  return {
    current: currentLength,
    max: maxLength,
    remaining: maxLength - currentLength,
    isOverLimit: currentLength > maxLength,
    isNearLimit: currentLength > maxLength * 0.8 // Warning at 80%
  };
}

/**
 * Format validation errors for display
 */
export function formatValidationError(error: ValidationError): string {
  return error.message;
}

/**
 * Get field validation rules summary for display
 */
export function getFieldValidationSummary(field: ProductField): string[] {
  const rules: string[] = [];

  if (field.is_required) {
    rules.push('Required');
  }

  if (field.is_unique) {
    rules.push('Must be unique');
  }

  switch (field.field_type) {
    case 'text':
    case 'identifier':
      const maxLength = field.options?.max_length || (field.field_type === 'text' ? 255 : 50);
      rules.push(`Max ${maxLength} characters`);
      break;
    case 'textarea':
      const textAreaMax = field.options?.max_length || 65535;
      if (textAreaMax < 65535) {
        rules.push(`Max ${textAreaMax} characters`);
      }
      break;
    case 'number':
      if (field.options?.min !== undefined) {
        rules.push(`Min value: ${field.options.min}`);
      }
      if (field.options?.max !== undefined) {
        rules.push(`Max value: ${field.options.max}`);
      }
      break;
  }

  return rules;
}
