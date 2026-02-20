'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';

interface NumberFieldOptions {
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  allowNegative?: boolean;
  unit?: string;
}

interface NumberFieldProps {
  value?: NumberFieldOptions;
  onChange: (options: NumberFieldOptions) => void;
}

export default function NumberField({ value = {}, onChange }: NumberFieldProps) {
  const [options, setOptions] = useState<NumberFieldOptions>({
    min: undefined,
    max: undefined,
    step: 1,
    decimals: 0,
    allowNegative: true,
    unit: '',
    ...value
  });

  const updateOption = (key: keyof NumberFieldOptions, val: any) => {
    const next = { ...options, [key]: val };
    setOptions(next);
    onChange(next);
  };

  const previewHint = useMemo(() => {
    const parts: string[] = [];
    if (options.min !== undefined) {
      parts.push(`Min ${options.min}`);
    }
    if (options.max !== undefined) {
      parts.push(`Max ${options.max}`);
    }
    if ((options.decimals ?? 0) > 0) {
      parts.push(`${options.decimals} decimal place${options.decimals === 1 ? '' : 's'}`);
    } else {
      parts.push('Whole numbers only');
    }
    if (options.allowNegative === false) {
      parts.push('Positive values only');
    }
    return parts.join(' • ');
  }, [options.min, options.max, options.decimals, options.allowNegative]);

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
              value={options.min ?? ''}
              onChange={(e) =>
                updateOption('min', e.target.value === '' ? undefined : Number(e.target.value))
              }
              placeholder="No minimum"
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Maximum value</label>
            <Input
              type="number"
              value={options.max ?? ''}
              onChange={(e) =>
                updateOption('max', e.target.value === '' ? undefined : Number(e.target.value))
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
              value={options.decimals ?? 0}
              onChange={(e) => updateOption('decimals', e.target.value === '' ? 0 : Number(e.target.value))}
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
            checked={options.allowNegative ?? true}
            onChange={(e) => updateOption('allowNegative', e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm leading-6 text-foreground">Allow negative values</span>
        </label>

        <div className="rounded-lg border border-border/60 bg-background px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-3 flex items-center gap-3">
            <Input
              type="number"
              min={options.min}
              max={options.max}
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
