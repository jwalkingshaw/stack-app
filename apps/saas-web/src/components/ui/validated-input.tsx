'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProductField, validateFieldValue, getCharacterInfo, ValidationError } from '@/lib/field-validation';

interface ValidatedInputProps {
  field: ProductField;
  value: string;
  onChange: (value: string) => void;
  onValidation?: (errors: ValidationError[]) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function ValidatedInput({
  field,
  value = '',
  onChange,
  onValidation,
  className,
  placeholder,
  disabled
}: ValidatedInputProps) {
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [touched, setTouched] = useState(false);

  // Validate on value change
  useEffect(() => {
    if (touched) {
      const result = validateFieldValue(value, field);
      setErrors(result.errors);
      onValidation?.(result.errors);
    }
  }, [value, field, touched, onValidation]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
  };

  const handleBlur = () => {
    setTouched(true);
    const result = validateFieldValue(value, field);
    setErrors(result.errors);
    onValidation?.(result.errors);
  };

  const charInfo = getCharacterInfo(value, field);
  const hasErrors = errors.length > 0 && touched;

  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          className,
          hasErrors && "border-destructive focus:border-destructive",
          charInfo.isOverLimit && "border-destructive focus:border-destructive"
        )}
      />

      {/* Character counter for text fields */}
      {(field.field_type === 'text' || field.field_type === 'identifier') && (
        <div className="flex justify-between items-center text-xs">
          <div className="space-y-1">
            {hasErrors && (
              <div className="text-destructive">
                {errors.map((error, index) => (
                  <div key={index}>{error.message}</div>
                ))}
              </div>
            )}
          </div>
          <div className={cn(
            "text-muted-foreground",
            charInfo.isOverLimit && "text-destructive",
            charInfo.isNearLimit && !charInfo.isOverLimit && "text-orange-500"
          )}>
            {charInfo.current}/{charInfo.max}
          </div>
        </div>
      )}

      {/* Error messages for non-text fields */}
      {hasErrors && field.field_type !== 'text' && field.field_type !== 'identifier' && (
        <div className="text-xs text-destructive space-y-1">
          {errors.map((error, index) => (
            <div key={index}>{error.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ValidatedTextAreaProps {
  field: ProductField;
  value: string;
  onChange: (value: string) => void;
  onValidation?: (errors: ValidationError[]) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}

export function ValidatedTextArea({
  field,
  value = '',
  onChange,
  onValidation,
  className,
  placeholder,
  disabled,
  rows = 3
}: ValidatedTextAreaProps) {
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [touched, setTouched] = useState(false);

  // Validate on value change
  useEffect(() => {
    if (touched) {
      const result = validateFieldValue(value, field);
      setErrors(result.errors);
      onValidation?.(result.errors);
    }
  }, [value, field, touched, onValidation]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
  };

  const handleBlur = () => {
    setTouched(true);
    const result = validateFieldValue(value, field);
    setErrors(result.errors);
    onValidation?.(result.errors);
  };

  const charInfo = getCharacterInfo(value, field);
  const hasErrors = errors.length > 0 && touched;

  return (
    <div className="space-y-1">
      <textarea
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(
          "w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none",
          className,
          hasErrors && "border-destructive focus:border-destructive",
          charInfo.isOverLimit && "border-destructive focus:border-destructive"
        )}
      />

      {/* Character counter and errors */}
      <div className="flex justify-between items-start text-xs">
        <div className="space-y-1 flex-1">
          {hasErrors && (
            <div className="text-destructive">
              {errors.map((error, index) => (
                <div key={index}>{error.message}</div>
              ))}
            </div>
          )}
        </div>
        <div className={cn(
          "text-muted-foreground ml-2",
          charInfo.isOverLimit && "text-destructive",
          charInfo.isNearLimit && !charInfo.isOverLimit && "text-orange-500"
        )}>
          {charInfo.current}/{charInfo.max}
        </div>
      </div>
    </div>
  );
}