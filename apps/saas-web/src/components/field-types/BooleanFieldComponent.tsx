'use client';

import { Switch } from '@/components/ui/switch';
import { ProductField } from './DynamicFieldRenderer';
import { normalizeBooleanFieldOptions } from './field-option-schema';

interface BooleanFieldComponentProps {
  field: ProductField;
  value?: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function BooleanFieldComponent({
  field,
  value = false,
  onChange,
  disabled = false,
  className = ''
}: BooleanFieldComponentProps) {
  const handleChange = (checked: boolean) => onChange?.(checked);
  const options = normalizeBooleanFieldOptions(field.options);
  const trueLabel = options.true_label;
  const falseLabel = options.false_label;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {options.display_style === 'toggle' && (
        <Switch
          checked={value}
          onCheckedChange={handleChange}
          disabled={disabled}
          aria-label={field.name}
        />
      )}

      {options.display_style === 'checkbox' && (
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => handleChange(event.target.checked)}
          disabled={disabled}
          aria-label={field.name}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
      )}

      {options.display_style === 'radio' && (
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              checked={value === true}
              onChange={() => handleChange(true)}
              disabled={disabled}
              className="h-4 w-4 rounded-full border-border text-primary focus:ring-primary"
            />
            <span>{trueLabel}</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              checked={value === false}
              onChange={() => handleChange(false)}
              disabled={disabled}
              className="h-4 w-4 rounded-full border-border text-primary focus:ring-primary"
            />
            <span>{falseLabel}</span>
          </label>
        </div>
      )}

      {options.display_style !== 'radio' && (
        <span className="text-sm text-foreground">{value ? trueLabel : falseLabel}</span>
      )}
    </div>
  );
}
