// Field validation utilities for both frontend and backend
import { validateBarcode } from '@/lib/barcode-utils';

export interface ProductField {
  id: string;
  code: string;
  name: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  options: Record<string, unknown>;
  validation_rules?: Record<string, unknown>;
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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as UnknownRecord;
}

function getNumberOption(options: Record<string, unknown>, key: string): number | undefined {
  const value = options[key];
  return typeof value === 'number' ? value : undefined;
}

function getBooleanOption(options: Record<string, unknown>, key: string): boolean | undefined {
  const value = options[key];
  return typeof value === 'boolean' ? value : undefined;
}

function getStringOption(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return typeof value === 'string' ? value : undefined;
}

function getStringArrayOption(options: Record<string, unknown>, key: string): string[] {
  const value = options[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function getOptionValues(options: Record<string, unknown>, key: string): string[] {
  const rawOptions = options[key];
  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      const record = asRecord(entry);
      const value = record?.value;
      return typeof value === 'string' ? value : null;
    })
    .filter((entry): entry is string => typeof entry === 'string');
}

function toDateInput(value: unknown): string | number | Date | null {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return null;
}

/**
 * Validates a single field value against its configuration
 */
export function validateFieldValue(
  value: unknown,
  field: ProductField
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
  data: Record<string, unknown>,
  fields: ProductField[]
): ValidationResult {
  const allErrors: ValidationError[] = [];

  for (const field of fields) {
    const value = data[field.code];
    const result = validateFieldValue(value, field);
    allErrors.push(...result.errors);
  }

  return { isValid: allErrors.length === 0, errors: allErrors };
}

/**
 * Text field validation
 */
function validateTextField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (typeof value !== 'string') {
    errors.push({
      field: field.code,
      message: `${field.name} must be a text value`,
      code: 'INVALID_TYPE'
    });
    return;
  }

  const maxLength = getNumberOption(field.options, 'max_length') ?? 255;
  if (value.length > maxLength) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot exceed ${maxLength} characters`,
      code: 'MAX_LENGTH_EXCEEDED'
    });
  }

  const minLength = getNumberOption(field.options, 'min_length') ?? 0;
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
function validateTextAreaField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (typeof value !== 'string') {
    errors.push({
      field: field.code,
      message: `${field.name} must be a text value`,
      code: 'INVALID_TYPE'
    });
    return;
  }

  const maxLength = getNumberOption(field.options, 'max_length') ?? 65535;
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
function validateNumberField(value: unknown, field: ProductField, errors: ValidationError[]) {
  const numValue = Number(value);
  if (isNaN(numValue)) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid number`,
      code: 'INVALID_NUMBER'
    });
    return;
  }

  const allowNegative =
    getBooleanOption(field.options, 'allow_negative') ??
    getBooleanOption(field.options, 'allowNegative') ??
    true;
  if (!allowNegative && numValue < 0) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot be negative`,
      code: 'NEGATIVE_NUMBER'
    });
  }

  const minValue = getNumberOption(field.options, 'min_value') ?? getNumberOption(field.options, 'min');
  if (minValue !== undefined && numValue < minValue) {
    errors.push({
      field: field.code,
      message: `${field.name} must be at least ${minValue}`,
      code: 'MIN_VALUE_NOT_MET'
    });
  }

  const maxValue = getNumberOption(field.options, 'max_value') ?? getNumberOption(field.options, 'max');
  if (maxValue !== undefined && numValue > maxValue) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot exceed ${maxValue}`,
      code: 'MAX_VALUE_EXCEEDED'
    });
  }
}

/**
 * Identifier field validation
 */
function validateIdentifierField(value: unknown, field: ProductField, errors: ValidationError[]) {
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

  const maxLength = getNumberOption(field.options, 'max_length') ?? 50;
  if (value.length > maxLength) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot exceed ${maxLength} characters`,
      code: 'MAX_LENGTH_EXCEEDED'
    });
  }

  const isBarcodeIdentifier =
    field.code === 'barcode' || getStringOption(field.options, 'identifier_kind') === 'barcode';

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
function validateMeasurementField(value: unknown, field: ProductField, errors: ValidationError[]) {
  const valueRecord = asRecord(value);
  if (!valueRecord) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid measurement`,
      code: 'INVALID_MEASUREMENT'
    });
    return;
  }

  if (getBooleanOption(field.options, 'composite')) {
    const componentSchemaRaw = field.options.component_schema;
    const componentSchema = Array.isArray(componentSchemaRaw)
      ? componentSchemaRaw
          .map((entry: unknown) =>
            typeof entry === 'object' && entry !== null
              ? (entry as Record<string, unknown>).key
              : null
          )
          .filter((key): key is string => typeof key === 'string' && key.length > 0)
      : Array.isArray(field.options.components)
      ? field.options.components.filter((entry): entry is string => typeof entry === 'string')
      : [];

    if (componentSchema.length === 0) {
      return;
    }

    const valueComponents = valueRecord.components;
    const componentSource = asRecord(valueComponents) ?? valueRecord;

    for (const componentKey of componentSchema) {
      const rawComponentValue = componentSource?.[componentKey];
      if (rawComponentValue === undefined || rawComponentValue === null || rawComponentValue === '') {
        continue;
      }

      let numericValue: number | null = null;
      if (typeof rawComponentValue === 'object') {
        const componentRecord = asRecord(rawComponentValue);
        const amount =
          componentRecord?.amount ??
          componentRecord?.value ??
          componentRecord?.measurement ??
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
      } else if (!(getBooleanOption(field.options, 'allow_negative') ?? false) && numericValue < 0) {
        errors.push({
          field: field.code,
          message: `${field.name} ${componentKey} cannot be negative`,
          code: 'NEGATIVE_MEASUREMENT_COMPONENT'
        });
      }
    }
    return;
  }

  const amount = valueRecord.amount ?? valueRecord.value ?? valueRecord.measurement;
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

  if (!(getBooleanOption(field.options, 'allow_negative') ?? false) && numValue < 0) {
    errors.push({
      field: field.code,
      message: `${field.name} cannot be negative`,
      code: 'NEGATIVE_MEASUREMENT'
    });
  }
}

function validatePriceField(value: unknown, field: ProductField, errors: ValidationError[]) {
  const valueRecord = asRecord(value);
  if (!valueRecord) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid price`,
      code: 'INVALID_PRICE'
    });
    return;
  }

  const amount = valueRecord.amount ?? valueRecord.value ?? valueRecord.price;
  const currencyRaw = valueRecord.currency ?? valueRecord.code ?? valueRecord.unit;
  const currency = typeof currencyRaw === 'string' ? currencyRaw : undefined;

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
      if (!(getBooleanOption(field.options, 'allow_negative') ?? false) && numAmount < 0) {
        errors.push({
          field: field.code,
          message: `${field.name} cannot be negative`,
          code: 'NEGATIVE_PRICE_AMOUNT'
        });
      }
      const minValue = getNumberOption(field.options, 'min_value');
      if (minValue !== undefined && numAmount < minValue) {
        errors.push({
          field: field.code,
          message: `${field.name} must be at least ${minValue}`,
          code: 'PRICE_BELOW_MIN'
        });
      }
      const maxValue = getNumberOption(field.options, 'max_value');
      if (maxValue !== undefined && numAmount > maxValue) {
        errors.push({
          field: field.code,
          message: `${field.name} must be less than or equal to ${maxValue}`,
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
    getStringArrayOption(field.options, 'allowed_currencies').length > 0 &&
    !getStringArrayOption(field.options, 'allowed_currencies').includes(currency)
  ) {
    errors.push({
      field: field.code,
      message: `${currency} is not allowed for ${field.name}`,
      code: 'INVALID_PRICE_CURRENCY'
    });
  }
}

function validateBooleanField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'boolean') {
    errors.push({
      field: field.code,
      message: `${field.name} must be true or false`,
      code: 'INVALID_BOOLEAN'
    });
  }
}

function validateDateField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (!value) return;
  const dateInput = toDateInput(value);
  if (!dateInput) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid date`,
      code: 'INVALID_DATE'
    });
    return;
  }
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid date`,
      code: 'INVALID_DATE'
    });
  }
}

function validateDateTimeField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (!value) return;
  const dateInput = toDateInput(value);
  if (!dateInput) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid date/time`,
      code: 'INVALID_DATETIME'
    });
    return;
  }
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    errors.push({
      field: field.code,
      message: `${field.name} must be a valid date/time`,
      code: 'INVALID_DATETIME'
    });
  }
}

function validateSelectField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (value === undefined || value === null || value === '') return;
  const options = getOptionValues(field.options, 'options');
  if (typeof value !== 'string') {
    errors.push({
      field: field.code,
      message: `${field.name} must be one of the available options`,
      code: 'INVALID_SELECT_OPTION'
    });
    return;
  }
  if (options.length > 0 && !options.includes(value)) {
    errors.push({
      field: field.code,
      message: `${field.name} must be one of the available options`,
      code: 'INVALID_SELECT_OPTION'
    });
  }
}

function validateMultiSelectField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push({
      field: field.code,
      message: `${field.name} must be an array of options`,
      code: 'INVALID_MULTISELECT_TYPE'
    });
    return;
  }

  const options = getOptionValues(field.options, 'options');
  if (options.length === 0) return;

  const invalidValues = value.filter((val) => typeof val !== 'string' || !options.includes(val));
  if (invalidValues.length > 0) {
    errors.push({
      field: field.code,
      message: `${field.name} contains invalid options: ${invalidValues.join(', ')}`,
      code: 'INVALID_MULTISELECT_OPTION'
    });
  }
}

function validateFileField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (value === null || value === undefined) return;
  const allowMultiple = getBooleanOption(field.options, 'allow_multiple') ?? false;
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
    const fileRecord = asRecord(fileValue);
    if (!fileRecord) {
      errors.push({
        field: field.code,
        message: `${field.name} contains an invalid file reference`,
        code: 'INVALID_FILE_REFERENCE'
      });
      return;
    }

    const assetId = fileRecord.assetId;
    const mimeTypeRaw = fileRecord.mimeType;
    const mimeType = typeof mimeTypeRaw === 'string' ? mimeTypeRaw : null;
    const size = fileRecord.size;
    if (!assetId) {
      errors.push({
        field: field.code,
        message: `${field.name} is missing an asset reference`,
        code: 'MISSING_FILE_ASSET'
      });
    }
    if (
      mimeType &&
      getStringArrayOption(field.options, 'allowed_mime_groups').length > 0
    ) {
      const allowed = getStringArrayOption(field.options, 'allowed_mime_groups').some((group) => {
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

    const maxSizeMb = getNumberOption(field.options, 'max_size_mb');
    if (size !== undefined && size !== null && maxSizeMb !== undefined) {
      const maxBytes = maxSizeMb * 1024 * 1024;
      if (Number(size) > maxBytes) {
        errors.push({
          field: field.code,
          message: `${field.name} exceeds the maximum size of ${maxSizeMb}MB`,
          code: 'FILE_SIZE_EXCEEDED'
        });
      }
    }
  });
}

function validateImageField(value: unknown, field: ProductField, errors: ValidationError[]) {
  if (value === null || value === undefined) return;
  const allowMultiple = getBooleanOption(field.options, 'allow_multiple') ?? false;
  const values = allowMultiple ? (Array.isArray(value) ? value : [value]) : [value];

  values.forEach((image) => {
    validateFileField(image, field, errors);
    const imageRecord = asRecord(image);
    if (!imageRecord) return;
    const mimeType = typeof imageRecord.mimeType === 'string' ? imageRecord.mimeType : '';
    if (!mimeType || !/^image\//i.test(mimeType)) {
      errors.push({
        field: field.code,
        message: `${field.name} must reference an image file`,
        code: 'INVALID_IMAGE_TYPE'
      });
    }
    const requireAltText = getBooleanOption(field.options, 'require_alt_text') ?? true;
    const altText = typeof imageRecord.altText === 'string' ? imageRecord.altText : '';
    if (requireAltText && !altText) {
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
      maxLength = getNumberOption(field.options, 'max_length') ?? 255;
      break;
    case 'textarea':
      maxLength = getNumberOption(field.options, 'max_length') ?? 65535;
      break;
    case 'identifier':
      maxLength = getNumberOption(field.options, 'max_length') ?? 50;
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
      const maxLength = getNumberOption(field.options, 'max_length') ?? (field.field_type === 'text' ? 255 : 50);
      rules.push(`Max ${maxLength} characters`);
      break;
    case 'textarea':
      const textAreaMax = getNumberOption(field.options, 'max_length') ?? 65535;
      if (textAreaMax < 65535) {
        rules.push(`Max ${textAreaMax} characters`);
      }
      break;
    case 'number':
      const minValue = getNumberOption(field.options, 'min');
      if (minValue !== undefined) {
        rules.push(`Min value: ${minValue}`);
      }
      const maxValue = getNumberOption(field.options, 'max');
      if (maxValue !== undefined) {
        rules.push(`Max value: ${maxValue}`);
      }
      break;
  }

  return rules;
}
