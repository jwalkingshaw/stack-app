'use client';

import { useState, useEffect, useRef } from 'react';
import { SimpleRichTextEditor, richTextToPlainText } from '@/components/ui/simple-rich-text-editor';
import { ProductField } from './DynamicFieldRenderer';
import { normalizeTextAreaFieldOptions } from './field-option-schema';

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
  const options = normalizeTextAreaFieldOptions(field.options);

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
    if (textarea && options.auto_resize !== false) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [localValue, options.auto_resize]);

  const rows = options.rows || 4;
  const maxLength = options.max_length;
  const minLength = options.min_length;
  const isRichText = options.rich_text === true;
  const richTextCharacterCount = richTextToPlainText(localValue).length;

  if (isRichText) {
    return (
      <div className="space-y-2">
        <SimpleRichTextEditor
          value={localValue}
          onChange={(newValue) => {
            setLocalValue(newValue);
            if (onChange) {
              onChange(newValue);
            }
          }}
          placeholder={field.description || `Enter ${field.name.toLowerCase()}`}
          disabled={disabled}
          className={className}
          minHeightClassName={rows >= 8 ? 'min-h-[240px]' : rows >= 6 ? 'min-h-[220px]' : 'min-h-[180px]'}
          stripFormattingOnPaste={options.strip_formatting_on_paste}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          {minLength && <span>Minimum {minLength} characters</span>}
          {maxLength && (
            <span>
              {richTextCharacterCount}/{maxLength} characters
            </span>
          )}
        </div>
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
        className={`w-full px-3 py-2.5 border border-border rounded-md text-foreground bg-background focus:outline-none focus:ring-0 focus:border-border transition-colors resize-vertical ${className}`}
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
