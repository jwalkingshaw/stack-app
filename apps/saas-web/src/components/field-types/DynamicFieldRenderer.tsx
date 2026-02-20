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
  options: Record<string, any>;
  validation_rules?: Record<string, any>;
}

interface DynamicFieldRendererProps {
  field: ProductField;
  value?: any;
  onChange?: (fieldCode: string, value: any) => void;
  tenantSlug?: string;
  disabled?: boolean;
  className?: string;
}

export function DynamicFieldRenderer({
  field,
  value,
  onChange,
  tenantSlug,
  disabled = false,
  className = ''
}: DynamicFieldRendererProps) {
  const handleChange = (newValue: any) => {
    if (onChange) {
      onChange(field.code, newValue);
    }
  };

  // Common props for all field components
  const commonProps = {
    field,
    value,
    onChange: handleChange,
    disabled,
    className
  };

  // Render the appropriate component based on field type
  switch (field.field_type) {
    case 'text':
      return <TextFieldComponent {...commonProps} />;

    case 'textarea':
      return <TextAreaFieldComponent {...commonProps} />;

    case 'boolean':
      return <BooleanFieldComponent {...commonProps} />;

    case 'number':
      return <NumberFieldComponent {...commonProps} />;

    case 'date':
      return <DateFieldComponent {...commonProps} />;

    case 'select':
      return <SelectFieldComponent {...commonProps} />;

    case 'multi_select':
    case 'multiselect':
      return <MultiSelectFieldComponent {...commonProps} />;

    case 'measurement':
      return <MeasurementFieldComponent {...commonProps} />;

    case 'price':
      return <PriceFieldComponent {...commonProps} />;

    case 'table':
      return <TableFieldComponent {...commonProps} tenantSlug={tenantSlug} />;

    case 'file':
      return (
        <FileFieldComponent
          field={field}
          value={value}
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
          value={value}
          onChange={(val) => handleChange(val)}
          tenantSlug={tenantSlug}
          disabled={disabled}
          className={className}
        />
      );

    default:
      // Fallback to text input for unknown field types
      return <TextFieldComponent {...commonProps} />;
  }
}
