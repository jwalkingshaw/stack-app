'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProductField } from './DynamicFieldRenderer';
import { normalizeDateFieldOptions } from './field-option-schema';

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

  const options = normalizeDateFieldOptions(field.options);
  const inputType = options.format === 'datetime' ? 'datetime-local' : options.format === 'time' ? 'time' : 'date';

  // Format the value for display
  const formatValue = (val: string | undefined | null) => {
    if (!val || typeof val !== 'string') return '';

    // If it's a full ISO datetime string and we need date-only
    if (options.format === 'date' && val.includes('T')) {
      return val.split('T')[0];
    }

    // If it's a date-only string and we need datetime
    if (options.format === 'datetime' && !val.includes('T')) {
      return `${val}T00:00`;
    }

    if (options.format === 'datetime') {
      return val.slice(0, 16);
    }

    return val;
  };

  const minDate = formatValue(options.min_date);
  const maxDate = formatValue(options.max_date);
  const formatDisplay = (val: string) =>
    options.format === 'datetime' ? new Date(val).toLocaleString() : new Date(val).toLocaleDateString();

  return (
    <div className="space-y-2">
      <Input
        type={inputType}
        value={formatValue(value)}
        onChange={handleChange}
        disabled={disabled}
        min={minDate || undefined}
        max={maxDate || undefined}
        className={cn('h-10', className)}
        placeholder={field.description || `Select ${field.name.toLowerCase()}`}
      />
      {options.min_date && (
        <div className="text-xs text-muted-foreground">
          Minimum date: {formatDisplay(options.min_date)}
        </div>
      )}
      {options.max_date && (
        <div className="text-xs text-muted-foreground">
          Maximum date: {formatDisplay(options.max_date)}
        </div>
      )}
    </div>
  );
}
