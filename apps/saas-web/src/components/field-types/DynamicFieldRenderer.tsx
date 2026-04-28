'use client';

import { TextFieldComponent } from './TextFieldComponent';
import { TextAreaFieldComponent } from './TextAreaFieldComponent';
import { BooleanFieldComponent } from './BooleanFieldComponent';
import { NumberFieldComponent } from './NumberFieldComponent';
import { DateFieldComponent } from './DateFieldComponent';
import { SelectFieldComponent } from './SelectFieldComponent';
import { MultiSelectFieldComponent } from './MultiSelectFieldComponent';
import { MeasurementFieldComponent } from './MeasurementFieldComponent';
import { PriceFieldComponent } from './PriceFieldComponent';
import { FileFieldComponent } from './FileFieldComponent';
import { ImageFieldComponent } from './ImageFieldComponent';
import { TableFieldComponent } from './TableFieldComponent';

export interface ProductField {
  id: string;
  code: string;
  name: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validation_rules?: Record<string, any>;
}

interface DynamicFieldRendererProps {
  field: ProductField;
  value?: unknown;
  onChange?: (fieldCode: string, value: unknown) => void;
  tenantSlug?: string;
  disabled?: boolean;
  className?: string;
  productName?: string;
  ingredients?: string;
  otherIngredients?: string;
}

export function DynamicFieldRenderer({
  field,
  value,
  onChange,
  tenantSlug,
  disabled = false,
  className = '',
  productName,
  ingredients,
  otherIngredients,
}: DynamicFieldRendererProps) {
  const handleChange = (newValue: unknown) => {
    if (onChange) {
      onChange(field.code, newValue);
    }
  };

  const asTextValue = typeof value === 'string' ? value : undefined;
  const asBooleanValue = typeof value === 'boolean' ? value : undefined;
  const asNumberValue =
    typeof value === 'number' || typeof value === 'string' ? value : undefined;
  const asStringArrayValue = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
  const asPriceValue =
    typeof value === 'number' ||
    typeof value === 'string' ||
    (value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'amount' in value &&
      'currency' in value)
      ? (value as { amount: number | string; currency: string } | string | number)
      : undefined;
  const asFileValue =
    value === null ||
    (value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'assetId' in value) ||
    (Array.isArray(value) &&
      value.every(
        (entry) =>
          entry && typeof entry === 'object' && !Array.isArray(entry) && 'assetId' in entry
      ))
      ? (value as
          | import('./FileFieldComponent').FileAttributeValue
          | import('./FileFieldComponent').FileAttributeValue[]
          | null)
      : undefined;
  const asImageValue =
    value === null ||
    (value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'assetId' in value) ||
    (Array.isArray(value) &&
      value.every(
        (entry) =>
          entry && typeof entry === 'object' && !Array.isArray(entry) && 'assetId' in entry
      ))
      ? (value as
          | import('./ImageFieldComponent').ImageAttributeValue
          | import('./ImageFieldComponent').ImageAttributeValue[]
          | null)
      : undefined;

  // Render the appropriate component based on field type
  switch (field.field_type) {
    case 'text':
      return (
        <TextFieldComponent
          field={field}
          value={asTextValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'textarea':
      return (
        <TextAreaFieldComponent
          field={field}
          value={asTextValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'boolean':
      return (
        <BooleanFieldComponent
          field={field}
          value={asBooleanValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'number':
      return (
        <NumberFieldComponent
          field={field}
          value={asNumberValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'date':
      return (
        <DateFieldComponent
          field={field}
          value={asTextValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'select':
      return (
        <SelectFieldComponent
          field={field}
          value={asTextValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'multi_select':
    case 'multiselect':
      return (
        <MultiSelectFieldComponent
          field={field}
          value={asStringArrayValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'measurement':
      return (
        <MeasurementFieldComponent
          field={field}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'price':
      return (
        <PriceFieldComponent
          field={field}
          value={asPriceValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );

    case 'table':
      return (
        <TableFieldComponent
          field={field}
          value={value}
          onChange={handleChange}
          tenantSlug={tenantSlug}
          disabled={disabled}
          className={className}
          productName={productName}
          ingredients={ingredients}
          otherIngredients={otherIngredients}
        />
      );

    case 'file':
      return (
        <FileFieldComponent
          field={field}
          value={asFileValue}
          onChange={(val) => handleChange(val)}
          tenantSlug={tenantSlug}
          disabled={disabled}
          className={className}
        />
      );

    case 'image':
      return (
        <ImageFieldComponent
          field={field}
          value={asImageValue}
          onChange={(val) => handleChange(val)}
          tenantSlug={tenantSlug}
          disabled={disabled}
          className={className}
        />
      );

    default:
      // Fallback to text input for unknown field types
      return (
        <TextFieldComponent
          field={field}
          value={asTextValue}
          onChange={handleChange}
          disabled={disabled}
          className={className}
        />
      );
  }
}
