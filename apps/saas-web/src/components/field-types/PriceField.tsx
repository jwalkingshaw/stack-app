'use client';

import { useEffect, useRef, useState } from 'react';
import { DollarSign, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PriceFieldOptions {
  default_currency?: string;
  allowed_currencies?: string[];
  allow_negative?: boolean;
  min_value?: number;
  max_value?: number;
}

interface PriceFieldProps {
  value?: PriceFieldOptions;
  onChange?: (value: PriceFieldOptions) => void;
}

const DEFAULT_CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD'];

export default function PriceField({ value, onChange }: PriceFieldProps) {
  const initialiseState = (input?: PriceFieldOptions) => ({
    defaultCurrency: input?.default_currency || 'USD',
    allowedCurrencies:
      input?.allowed_currencies && input.allowed_currencies.length > 0
        ? [...input.allowed_currencies]
        : [...DEFAULT_CURRENCIES],
    allowNegative: !!input?.allow_negative,
    minValue: input?.min_value !== undefined && input.min_value !== null ? String(input.min_value) : '',
    maxValue: input?.max_value !== undefined && input.max_value !== null ? String(input.max_value) : '',
  });

  const [state, setState] = useState(() => initialiseState(value));
  const [newCurrency, setNewCurrency] = useState('');

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const buildOptions = (s = state): PriceFieldOptions => ({
    default_currency: s.defaultCurrency,
    allowed_currencies: s.allowedCurrencies,
    allow_negative: s.allowNegative,
    min_value: s.minValue === '' ? undefined : Number(s.minValue),
    max_value: s.maxValue === '' ? undefined : Number(s.maxValue),
  });

  const emit = (nextState = state) => {
    onChangeRef.current?.(buildOptions(nextState));
  };

  useEffect(() => {
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value) return;
    const next = initialiseState(value);
    const current = buildOptions(state);
    const incoming = buildOptions(next);
    if (JSON.stringify(current) !== JSON.stringify(incoming)) {
      setState(next);
      emit(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const updateState = (updater: (prev: ReturnType<typeof initialiseState>) => ReturnType<typeof initialiseState>) => {
    setState((prev) => {
      const next = updater(prev);
      emit(next);
      return next;
    });
  };

  const addCurrency = () => {
    if (!newCurrency) return;
    const normalized = newCurrency.trim().toUpperCase();
    if (!normalized) return;
    if (state.allowedCurrencies.includes(normalized)) {
      setNewCurrency('');
      return;
    }
    updateState((prev) => ({
      ...prev,
      allowedCurrencies: [...prev.allowedCurrencies, normalized],
    }));
    setNewCurrency('');
  };

  const removeCurrency = (code: string) => {
    updateState((prev) => {
      const nextCurrencies = prev.allowedCurrencies.filter((c) => c !== code);
      const nextDefault =
        prev.defaultCurrency === code ? nextCurrencies[0] || 'USD' : prev.defaultCurrency;
      return {
        ...prev,
        allowedCurrencies: nextCurrencies,
        defaultCurrency: nextDefault,
      };
    });
  };

  const { defaultCurrency, allowedCurrencies, allowNegative, minValue, maxValue } = state;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <DollarSign className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Pricing settings</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose default currency, permitted values, and whether negative amounts are allowed.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Default currency */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Default currency</label>
          <Select
            value={defaultCurrency}
            onValueChange={(value) =>
              updateState((prev) => ({
                ...prev,
                defaultCurrency: value
              }))
            }
          >
            <SelectTrigger className="h-11">
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
          <p className="text-xs text-muted-foreground">
            This currency is pre-selected when editing products.
          </p>
        </div>

        {/* Allowed currencies */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">Allowed currencies</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
              placeholder="Add currency code (e.g. USD)"
              className="h-11 sm:flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCurrency();
                }
              }}
            />
            <Button type="button" onClick={addCurrency} disabled={!newCurrency.trim()} className="h-11 sm:w-auto">
              <Plus className="h-4 w-4" />
              <span className="ml-2 text-sm font-medium">Add</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {allowedCurrencies.map((currency) => (
              <span
                key={currency}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary"
              >
                {currency}
                <button
                  type="button"
                  className="rounded-full p-0.5 text-primary/70 transition hover:bg-primary/10 hover:text-primary"
                  onClick={() => removeCurrency(currency)}
                  aria-label={`Remove ${currency}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Restrict the currencies available when users enter prices.
          </p>
        </div>

        {/* Constraints */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Minimum value</label>
            <Input
              type="number"
              min={allowNegative ? undefined : 0}
              value={minValue}
              onChange={(e) =>
                updateState((prev) => ({
                  ...prev,
                  minValue: e.target.value
                }))
              }
              placeholder="No minimum"
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Maximum value</label>
            <Input
              type="number"
              min={allowNegative ? undefined : 0}
              value={maxValue}
              onChange={(e) =>
                updateState((prev) => ({
                  ...prev,
                  maxValue: e.target.value
                }))
              }
              placeholder="No maximum"
              className="h-11"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={allowNegative}
            onChange={(e) =>
              updateState((prev) => ({
                ...prev,
                allowNegative: e.target.checked
              }))
            }
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm leading-6 text-foreground">
            Allow negative values (for credits, discounts, etc.)
          </span>
        </label>
      </div>
    </div>
  );
}
