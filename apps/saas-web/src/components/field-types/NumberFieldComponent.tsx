'use client';

import { Input } from '@/components/ui/input';
import { ProductField } from './DynamicFieldRenderer';

interface NumberFieldComponentProps {
  field: ProductField;
  value?: number | string;
  onChange?: (value: number | string) => void;
  disabled?: boolean;
  className?: string;
}

export function NumberFieldComponent({
  field,
  value = '',
  onChange,
  disabled = false,
  className = ''
}: NumberFieldComponentProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      const inputValue = e.target.value;

      // Handle decimal vs integer
      if (field.options?.decimal_places !== undefined) {
        // Parse as float if decimal places are specified
        const numValue = parseFloat(inputValue);
        onChange(isNaN(numValue) ? inputValue : numValue);
      } else {
        // Parse as integer
        const numValue = parseInt(inputValue);
        onChange(isNaN(numValue) ? inputValue : numValue);
      }
    }
  };

  const min = field.options?.min_value;
  const max = field.options?.max_value;
  const step = field.options?.decimal_places !== undefined
    ? Math.pow(10, -field.options.decimal_places)
    : 1;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={handleChange}
          placeholder={field.description || `Enter ${field.name.toLowerCase()}`}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          className={className}
        />
        {field.options?.unit && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {field.options.unit}
          </div>
        )}
      </div>

      {(min !== undefined || max !== undefined) && (
        <div className="text-xs text-muted-foreground">
          {min !== undefined && max !== undefined
            ? `Range: ${min} - ${max}`
            : min !== undefined
            ? `Minimum: ${min}`
            : `Maximum: ${max}`
          }
          {field.options?.unit && ` ${field.options.unit}`}
        </div>
      )}
    </div>
  );
}