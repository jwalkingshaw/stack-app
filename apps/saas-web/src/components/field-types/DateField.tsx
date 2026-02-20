'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface DateFieldOptions {
  format?: 'date' | 'datetime' | 'time';
  minDate?: string;
  maxDate?: string;
  defaultToToday?: boolean;
}

interface DateFieldProps {
  value?: DateFieldOptions;
  onChange: (options: DateFieldOptions) => void;
}

export default function DateField({ value = {}, onChange }: DateFieldProps) {
  const [options, setOptions] = useState<DateFieldOptions>({
    format: 'date',
    minDate: '',
    maxDate: '',
    defaultToToday: false,
    ...value
  });

  const updateOption = (key: keyof DateFieldOptions, val: any) => {
    const newOptions = { ...options, [key]: val };
    setOptions(newOptions);
    onChange(newOptions);
  };

  const todayDate = new Date();
  const defaultDateValue =
    options.defaultToToday && options.format !== 'time'
      ? todayDate.toISOString().split('T')[0]
      : '';
  const defaultDateTimeValue =
    options.defaultToToday && options.format === 'datetime'
      ? todayDate.toISOString().slice(0, 16)
      : '';

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-foreground">Date field settings</h4>
        <p className="text-sm leading-6 text-muted-foreground">
          Control the format, allowed range, and default behaviour for this date input.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {/* Format Selection */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Date format</p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:bg-muted/40">
              <input
                type="radio"
                name="format"
                value="date"
                checked={options.format === 'date'}
                onChange={(e) => updateOption('format', e.target.value)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm leading-6 text-foreground">Date only (MM/DD/YYYY)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:bg-muted/40">
              <input
                type="radio"
                name="format"
                value="datetime"
                checked={options.format === 'datetime'}
                onChange={(e) => updateOption('format', e.target.value)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm leading-6 text-foreground">Date and time (MM/DD/YYYY HH:MM)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:bg-muted/40">
              <input
                type="radio"
                name="format"
                value="time"
                checked={options.format === 'time'}
                onChange={(e) => updateOption('format', e.target.value)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm leading-6 text-foreground">Time only (HH:MM)</span>
            </label>
          </div>
        </div>

        {/* Date Range */}
        {options.format !== 'time' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Minimum date</label>
              <Input
                type="date"
                value={options.minDate}
                onChange={(e) => updateOption('minDate', e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">Earliest allowed date</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Maximum date</label>
              <Input
                type="date"
                value={options.maxDate}
                onChange={(e) => updateOption('maxDate', e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">Latest allowed date</p>
            </div>
          </div>
        )}

        {/* Options */}
        {options.format !== 'time' && (
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:bg-muted/40">
              <input
                type="checkbox"
                checked={options.defaultToToday}
                onChange={(e) => updateOption('defaultToToday', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm leading-6 text-foreground">Default to today's date</span>
            </label>
          </div>
        )}

        {/* Preview */}
        <div className="rounded-md border border-border/60 bg-background px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-3 flex flex-col gap-3">
            {options.format === 'date' && (
              <Input
                type="date"
                min={options.minDate}
                max={options.maxDate}
                defaultValue={defaultDateValue}
                className="w-48"
              />
            )}

            {options.format === 'datetime' && (
              <Input
                type="datetime-local"
                min={options.minDate}
                max={options.maxDate}
                defaultValue={defaultDateTimeValue}
                className="w-64"
              />
            )}

            {options.format === 'time' && (
              <Input
                type="time"
                className="w-32"
              />
            )}

            <div className="text-xs text-muted-foreground">
              {options.minDate && `Min: ${options.minDate}`}
              {options.minDate && options.maxDate && ' • '}
              {options.maxDate && `Max: ${options.maxDate}`}
              {options.defaultToToday && (options.minDate || options.maxDate) && ' • '}
              {options.defaultToToday && 'Defaults to today'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
