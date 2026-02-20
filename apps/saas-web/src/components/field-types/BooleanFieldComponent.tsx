'use client';

import { Switch } from '@/components/ui/switch';
import { ProductField } from './DynamicFieldRenderer';

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
  const handleChange = (checked: boolean) => {
    if (onChange) {
      onChange(checked);
    }
  };

  const trueLabel = field.options?.true_label || 'Yes';
  const falseLabel = field.options?.false_label || 'No';

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <Switch
        checked={value}
        onCheckedChange={handleChange}
        disabled={disabled}
        aria-label={field.name}
      />
      <span className="text-sm text-foreground">
        {value ? trueLabel : falseLabel}
      </span>
    </div>
  );
}