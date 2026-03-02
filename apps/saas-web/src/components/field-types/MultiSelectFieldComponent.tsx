'use client';

import { useMemo } from 'react';
import { MultiSelect } from '@/components/ui/multi-select';
import { ProductField } from './DynamicFieldRenderer';

interface MultiSelectFieldComponentProps {
  field: ProductField;
  value?: string[];
  onChange?: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function MultiSelectFieldComponent({
  field,
  value = [],
  onChange,
  disabled = false,
  className = ''
}: MultiSelectFieldComponentProps) {
  // Ensure value is always an array
  const normalizedValue = Array.isArray(value) ? value : [];

  // Support both formats: field.options.options (new) and field.options.choices (legacy).
  const rawOptions = field.options?.options || field.options?.choices || [];
  const parsedMaxSelections = Number(field.options?.max_selections);
  const hasMaxSelections = Number.isFinite(parsedMaxSelections) && parsedMaxSelections > 0;
  const maxSelections = hasMaxSelections ? parsedMaxSelections : 0;
  const placeholder =
    field.options?.placeholder || field.description || `Select one or more ${field.name.toLowerCase()}`;

  const normalizedOptions = useMemo(
    () =>
      (Array.isArray(rawOptions) ? rawOptions : [])
        .map((option: any) => {
          const optionValue = option?.value ?? option;
          const optionLabel = option?.label ?? optionValue;
          if (!optionValue) return null;
          return {
            value: String(optionValue),
            label: String(optionLabel),
          };
        })
        .filter((option): option is { value: string; label: string } => Boolean(option)),
    [rawOptions]
  );

  const selectedSet = useMemo(() => new Set(normalizedValue), [normalizedValue]);
  const isMaxReached = hasMaxSelections && normalizedValue.length >= maxSelections;
  const constrainedOptions = normalizedOptions.map((option) => ({
    ...option,
    disabled: disabled || (isMaxReached && !selectedSet.has(option.value)),
  }));

  const handleChange = (next: string[]) => {
    if (!onChange) return;
    if (hasMaxSelections && next.length > maxSelections) {
      onChange(next.slice(0, maxSelections));
      return;
    }
    onChange(next);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <MultiSelect
        options={constrainedOptions}
        value={normalizedValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="h-8"
        disabled={disabled}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        {hasMaxSelections && (
          <span>
            {normalizedValue.length}/{maxSelections} selections
          </span>
        )}
        {isMaxReached && (
          <span className="text-amber-600">
            Maximum selections reached
          </span>
        )}
      </div>
    </div>
  );
}
