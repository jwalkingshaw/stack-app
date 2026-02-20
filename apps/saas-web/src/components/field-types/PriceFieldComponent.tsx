'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductField } from './DynamicFieldRenderer';

interface PriceValue {
  amount: number | string;
  currency: string;
}

interface PriceFieldComponentProps {
  field: ProductField;
  value?: PriceValue | string | number;
  onChange?: (value: PriceValue) => void;
  disabled?: boolean;
  className?: string;
}

const normalizeValue = (field: ProductField, value: any): PriceValue => {
  if (value && typeof value === 'object' && 'amount' in value && 'currency' in value) {
    return value as PriceValue;
  }

  const defaultCurrency =
    field.options?.default_currency ||
    field.options?.allowed_currencies?.[0] ||
    'USD';

  return {
    amount: typeof value === 'number' || typeof value === 'string' ? value : '',
    currency: defaultCurrency,
  };
};

export function PriceFieldComponent({
  field,
  value,
  onChange,
  disabled = false,
  className = '',
}: PriceFieldComponentProps) {
  const [currentValue, setCurrentValue] = useState<PriceValue>(() =>
    normalizeValue(field, value)
  );

  useEffect(() => {
    setCurrentValue(normalizeValue(field, value));
  }, [field, value]);

  const allowedCurrencies: string[] =
    field.options?.allowed_currencies && field.options.allowed_currencies.length > 0
      ? field.options.allowed_currencies
      : [field.options?.default_currency || 'USD'];

  const min = field.options?.min_value ?? (field.options?.allow_negative ? undefined : 0);
  const max = field.options?.max_value ?? undefined;

  const emitChange = (next: PriceValue) => {
    setCurrentValue(next);
    onChange?.(next);
  };

  return (
    <div className={`flex gap-2 items-start ${className}`}>
      <div className="flex-1">
        <Input
          type="number"
          value={currentValue.amount}
          disabled={disabled}
          min={min}
          max={max}
          step="0.01"
          onChange={(event) =>
            emitChange({
              ...currentValue,
              amount: event.target.value,
            })
          }
          placeholder={field.description || 'Enter amount'}
        />
        {(min !== undefined || max !== undefined) && (
          <p className="text-xs text-muted-foreground mt-1">
            {min !== undefined && max !== undefined
              ? `Range: ${min} - ${max}`
              : min !== undefined
              ? `Minimum: ${min}`
              : `Maximum: ${max}`}
          </p>
        )}
      </div>

      <Select
        value={currentValue.currency}
        onValueChange={(value) =>
          emitChange({
            ...currentValue,
            currency: value,
          })
        }
        disabled={disabled || allowedCurrencies.length === 1}
      >
        <SelectTrigger className="h-10 w-28 px-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowedCurrencies.map((currency) => (
            <SelectItem key={currency} value={currency}>
              {currency}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
