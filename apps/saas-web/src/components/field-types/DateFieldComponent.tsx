'use client';

import { Input } from '@/components/ui/input';
import { ProductField } from './DynamicFieldRenderer';

interface DateFieldComponentProps {
  field: ProductField;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function DateFieldComponent({
  field,
  value = '',
  onChange,
  disabled = false,
  className = ''
}: DateFieldComponentProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  // Determine the input type based on field options
  const includeTime = field.options?.include_time || false;
  const inputType = includeTime ? 'datetime-local' : 'date';

  // Format the value for display
  const formatValue = (val: string | undefined | null) => {
    if (!val || typeof val !== 'string') return '';

    // If it's a full ISO datetime string and we need date-only
    if (!includeTime && val.includes('T')) {
      return val.split('T')[0];
    }

    // If it's a date-only string and we need datetime
    if (includeTime && !val.includes('T')) {
      return `${val}T00:00`;
    }

    if (includeTime) {
      return val.slice(0, 16);
    }

    return val;
  };

  const minDate = formatValue(field.options?.min_date);
  const maxDate = formatValue(field.options?.max_date);
  const formatDisplay = (val: string) =>
    includeTime ? new Date(val).toLocaleString() : new Date(val).toLocaleDateString();

  return (
    <div className="space-y-2">
      <Input
        type={inputType}
        value={formatValue(value)}
        onChange={handleChange}
        disabled={disabled}
        min={minDate || undefined}
        max={maxDate || undefined}
        className={className}
        placeholder={field.description || `Select ${field.name.toLowerCase()}`}
      />
      {field.options?.min_date && (
        <div className="text-xs text-muted-foreground">
          Minimum date: {formatDisplay(field.options.min_date)}
        </div>
      )}
      {field.options?.max_date && (
        <div className="text-xs text-muted-foreground">
          Maximum date: {formatDisplay(field.options.max_date)}
        </div>
      )}
    </div>
  );
}
