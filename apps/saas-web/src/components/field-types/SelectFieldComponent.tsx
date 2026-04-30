'use client';

import { ProductField } from './DynamicFieldRenderer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SelectFieldComponentProps {
  field: ProductField;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SelectFieldComponent({
  field,
  value = '',
  onChange,
  disabled = false,
  className = ''
}: SelectFieldComponentProps) {
  // Support both formats: field.options.options (new) and field.options.choices (legacy)
  const options = field.options?.options || field.options?.choices || [];
  const normalizedOptions = (Array.isArray(options) ? options : [])
    .map((option: unknown) => {
      const optionRecord =
        option && typeof option === 'object' && !Array.isArray(option)
          ? (option as Record<string, unknown>)
          : null;
      const optionValueRaw = optionRecord?.value ?? option;
      const optionLabelRaw = optionRecord?.label ?? optionValueRaw;
      const optionValue = String(optionValueRaw ?? '');
      const optionLabel = String(optionLabelRaw ?? optionValue);
      if (!optionValue) return null;
      return { value: optionValue, label: optionLabel };
    })
    .filter((option): option is { value: string; label: string } => Boolean(option));
  const allowEmpty = field.options?.allowEmpty !== false && !field.is_required;
  const placeholder = field.options?.placeholder || field.description || `Select ${field.name.toLowerCase()}`;
  const selectValue = value || '__empty__';

  const handleValueChange = (nextValue: string) => {
    if (nextValue === '__empty__') {
      onChange?.('');
      return;
    }
    onChange?.(nextValue);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Select value={selectValue} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger className="h-10 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && (
            <SelectItem value="__empty__">
              Clear selection
            </SelectItem>
          )}
          {normalizedOptions.length === 0 ? (
            <SelectItem value="__no_options__" disabled>
              No options available
            </SelectItem>
          ) : (
            normalizedOptions.map((option) => {
              return (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              );
            })
          )}
        </SelectContent>
      </Select>

      {field.options?.allow_other && (
        <div className="text-xs text-muted-foreground">
          Contact support to add additional options
        </div>
      )}
    </div>
  );
}
