'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProductField } from './DynamicFieldRenderer';

interface TextFieldComponentProps {
  field: ProductField;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TextFieldComponent({
  field,
  value = '',
  onChange,
  disabled = false,
  className = ''
}: TextFieldComponentProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  const maxLength = field.options?.max_length;

  return (
    <div className="space-y-2">
      <Input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={field.description || `Enter ${field.name.toLowerCase()}`}
        disabled={disabled}
        maxLength={maxLength}
        className={cn('h-10', className)}
      />
      {maxLength && (
        <div className="text-xs text-muted-foreground text-right">
          {value.length}/{maxLength} characters
        </div>
      )}
    </div>
  );
}
