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
          {options.length === 0 ? (
            <SelectItem value="__no_options__" disabled>
              No options available
            </SelectItem>
          ) : (
            options.map((option: any) => {
              const optionValue = String(option.value || option);
              const optionLabel = option.label || option;
              return (
                <SelectItem key={optionValue} value={optionValue}>
                  {optionLabel}
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
