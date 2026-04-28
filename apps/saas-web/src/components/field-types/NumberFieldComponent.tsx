'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProductField } from './DynamicFieldRenderer';
import { normalizeNumberFieldOptions } from './field-option-schema';

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
  const options = normalizeNumberFieldOptions(field.options);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      const inputValue = e.target.value;

      // Handle decimal vs integer
      if (options.decimal_places !== undefined && options.decimal_places > 0) {
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

  const min = options.allow_negative ? options.min_value : Math.max(0, options.min_value ?? 0);
  const max = options.max_value;
  const step =
    options.step && options.step > 0
      ? options.step
      : options.decimal_places > 0
      ? Math.pow(10, -options.decimal_places)
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
          className={cn('h-10', className)}
        />
        {options.unit && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {options.unit}
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
          {options.unit && ` ${options.unit}`}
        </div>
      )}
    </div>
  );
}
