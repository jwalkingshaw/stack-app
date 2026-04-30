'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  CanonicalNumberFieldOptions,
  normalizeNumberFieldOptions,
} from './field-option-schema';

type NumberFieldOptions = CanonicalNumberFieldOptions;

interface NumberFieldProps {
  value?: Partial<NumberFieldOptions> | Record<string, unknown>;
  onChange: (options: NumberFieldOptions) => void;
}

export default function NumberField({ value, onChange }: NumberFieldProps) {
  const [options, setOptions] = useState<NumberFieldOptions>(() => normalizeNumberFieldOptions(value));

  useEffect(() => {
    setOptions(normalizeNumberFieldOptions(value));
  }, [value]);

  const updateOption = (
    key: keyof NumberFieldOptions,
    val: NumberFieldOptions[keyof NumberFieldOptions]
  ) => {
    const next = { ...options, [key]: val };
    setOptions(next);
    onChange(next);
  };

  const previewHint = useMemo(() => {
    const parts: string[] = [];
    if (options.min_value !== undefined) {
      parts.push(`Min ${options.min_value}`);
    }
    if (options.max_value !== undefined) {
      parts.push(`Max ${options.max_value}`);
    }
    if ((options.decimal_places ?? 0) > 0) {
      parts.push(`${options.decimal_places} decimal place${options.decimal_places === 1 ? '' : 's'}`);
    } else {
      parts.push('Whole numbers only');
    }
    if (options.allow_negative === false) {
      parts.push('Positive values only');
    }
    return parts.join(' | ');
  }, [options.min_value, options.max_value, options.decimal_places, options.allow_negative]);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-foreground">Number field settings</h4>
        <p className="text-sm leading-6 text-muted-foreground">
          Control the numeric range, decimal precision, and display unit for this field.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Minimum value</label>
            <Input
              type="number"
              value={options.min_value ?? ''}
              onChange={(e) =>
                updateOption('min_value', e.target.value === '' ? undefined : Number(e.target.value))
              }
              placeholder="No minimum"
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Maximum value</label>
            <Input
              type="number"
              value={options.max_value ?? ''}
              onChange={(e) =>
                updateOption('max_value', e.target.value === '' ? undefined : Number(e.target.value))
              }
              placeholder="No maximum"
              className="h-11"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Step size</label>
            <Input
              type="number"
              value={options.step ?? 1}
              onChange={(e) => updateOption('step', e.target.value === '' ? 1 : Number(e.target.value))}
              min="0.0001"
              step="0.0001"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">Increment applied when adjusting the value.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Decimal places</label>
            <Input
              type="number"
              value={options.decimal_places ?? 0}
              onChange={(e) => updateOption('decimal_places', e.target.value === '' ? 0 : Number(e.target.value))}
              min="0"
              max="10"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">Set how many decimal places are permitted.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Display unit (optional)</label>
          <Input
            value={options.unit ?? ''}
            onChange={(e) => updateOption('unit', e.target.value)}
            placeholder="e.g. kg, cm, pieces"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">Shown after the number when editing products.</p>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={options.allow_negative}
            onChange={(e) => updateOption('allow_negative', e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm leading-6 text-foreground">Allow negative values</span>
        </label>

        <div className="rounded-lg border border-border/60 bg-background px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-3 flex items-center gap-3">
            <Input
              type="number"
              min={options.allow_negative ? options.min_value : Math.max(0, options.min_value ?? 0)}
              max={options.max_value}
              step={options.step}
              placeholder="Enter number"
              className="h-11 w-40"
            />
            {options.unit && (
              <span className="text-sm font-medium text-muted-foreground">{options.unit}</span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{previewHint}</p>
        </div>
      </div>
    </div>
  );
}


