'use client';

import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, ChevronDown } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ensure value is always an array - handle cases where wrong type is passed
  const normalizedValue = Array.isArray(value) ? value : [];

  // Support both formats: field.options.options (new) and field.options.choices (legacy)
  const options = field.options?.options || field.options?.choices || [];
  const maxSelections = field.options?.max_selections;
  const placeholder = field.options?.placeholder || field.description || `Select ${field.name.toLowerCase()}`;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOption = (optionValue: string) => {
    if (!onChange) return;

    const newValue = normalizedValue.includes(optionValue)
      ? normalizedValue.filter(v => v !== optionValue)
      : [...normalizedValue, optionValue];

    onChange(newValue);
  };

  const handleRemoveValue = (valueToRemove: string) => {
    if (onChange) {
      onChange(normalizedValue.filter(v => v !== valueToRemove));
    }
  };

  const getOptionLabel = (optionValue: string) => {
    const option = options.find((opt: any) => (opt.value || opt) === optionValue);
    return option?.label || option || optionValue;
  };

  const isMaxReached = maxSelections && normalizedValue.length >= maxSelections;

  return (
    <div className={`space-y-2 ${className}`} ref={dropdownRef}>
      {/* Selected values display */}
      {normalizedValue.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-lg bg-white min-h-[2rem]">
          {normalizedValue.map((selectedValue) => (
            <Badge
              key={selectedValue}
              variant="secondary"
              className="flex items-center gap-1 px-2 py-1 text-xs"
            >
              {getOptionLabel(selectedValue)}
              {!disabled && (
                <button
                  onClick={() => handleRemoveValue(selectedValue)}
                  className="ml-1 hover:bg-muted rounded-sm"
                  type="button"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled || isMaxReached}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-sans shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          <span className={normalizedValue.length === 0 ? "text-muted-foreground" : "text-foreground"}>
            {normalizedValue.length === 0
              ? placeholder
              : `${normalizedValue.length} selected`
            }
          </span>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white text-foreground font-sans border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
            {options.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                No options available
              </div>
            ) : (
              options.map((option: any) => {
                const optionValue = option.value || option;
                const optionLabel = option.label || option;
                const isSelected = normalizedValue.includes(optionValue);
                const canSelect = !isSelected && (!maxSelections || normalizedValue.length < maxSelections);

                return (
                  <button
                    key={optionValue}
                    type="button"
                    onClick={() => handleToggleOption(optionValue)}
                    disabled={!isSelected && !canSelect}
                    className={`w-full px-3 py-2 text-left text-sm font-sans hover:bg-gray-100 transition-colors flex items-center justify-between ${
                      isSelected ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-900'
                    } ${
                      !isSelected && !canSelect ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {optionLabel}
                    {isSelected && (
                      <div className="w-2 h-2 bg-primary rounded-full" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Helper text */}
      <div className="flex justify-between text-xs text-muted-foreground">
        {maxSelections && (
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
