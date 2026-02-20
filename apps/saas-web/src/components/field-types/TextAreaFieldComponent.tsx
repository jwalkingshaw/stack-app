'use client';

import { useState, useEffect, useRef } from 'react';
import { ProductField } from './DynamicFieldRenderer';

interface TextAreaFieldComponentProps {
  field: ProductField;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TextAreaFieldComponent({
  field,
  value = '',
  onChange,
  disabled = false,
  className = ''
}: TextAreaFieldComponentProps) {
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync with external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  // Auto-resize functionality
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && field.options?.auto_resize !== false) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [localValue, field.options?.auto_resize]);

  const rows = field.options?.rows || 4;
  const maxLength = field.options?.max_length;
  const minLength = field.options?.min_length;
  const isRichText = field.options?.rich_text === true;

  // For now, we'll use a regular textarea
  // TODO: Add TinyMCE integration when rich_text is true
  if (isRichText) {
    return (
      <div className="space-y-2">
        <div className="border border-border rounded-md p-3 bg-muted/30">
          <p className="text-sm text-muted-foreground mb-2">
            Rich text editor will be available here
          </p>
          <textarea
            ref={textareaRef}
            value={localValue}
            onChange={handleChange}
            placeholder={field.description || `Enter ${field.name.toLowerCase()}`}
            disabled={disabled}
            rows={rows}
            maxLength={maxLength}
            className={`w-full px-3 py-2 border-0 bg-transparent text-foreground focus:ring-0 focus:outline-none resize-vertical ${className}`}
          />
        </div>
        {maxLength && (
          <div className="text-xs text-muted-foreground text-right">
            {localValue.length}/{maxLength} characters
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={localValue}
        onChange={handleChange}
        placeholder={field.description || `Enter ${field.name.toLowerCase()}`}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        className={`w-full px-3 py-2.5 border border-border rounded-md text-foreground bg-background focus:ring-2 focus:ring-primary focus:border-primary transition-colors resize-vertical ${className}`}
      />

      <div className="flex justify-between text-xs text-muted-foreground">
        {minLength && (
          <span>
            Minimum {minLength} characters
          </span>
        )}
        {maxLength && (
          <span>
            {localValue.length}/{maxLength} characters
          </span>
        )}
      </div>
    </div>
  );
}