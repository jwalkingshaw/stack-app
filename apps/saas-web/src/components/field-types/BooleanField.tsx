'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface BooleanFieldOptions {
  displayStyle?: 'checkbox' | 'toggle' | 'radio';
  trueLabel?: string;
  falseLabel?: string;
  defaultValue?: boolean;
}

interface BooleanFieldProps {
  value?: BooleanFieldOptions;
  onChange: (options: BooleanFieldOptions) => void;
}

export default function BooleanField({ value = {}, onChange }: BooleanFieldProps) {
  const [options, setOptions] = useState<BooleanFieldOptions>({
    displayStyle: 'checkbox',
    trueLabel: 'Yes',
    falseLabel: 'No',
    defaultValue: false,
    ...value
  });

  const updateOption = (key: keyof BooleanFieldOptions, val: any) => {
    const newOptions = { ...options, [key]: val };
    setOptions(newOptions);
    onChange(newOptions);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-foreground">Boolean Field Settings</h4>
        <p className="text-sm leading-6 text-muted-foreground">
          Configure how the boolean field appears to users and what value it defaults to.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {/* Display Style */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Display style</p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:border-[var(--color-accent-blue-hover)] hover:bg-muted/40">
              <input
                type="radio"
                name="displayStyle"
                value="checkbox"
                checked={options.displayStyle === 'checkbox'}
                onChange={(e) => updateOption('displayStyle', e.target.value)}
                className="h-4 w-4 rounded border-border text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
              />
              <span className="text-sm leading-6 text-foreground">Checkbox</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:border-[var(--color-accent-blue-hover)] hover:bg-muted/40">
              <input
                type="radio"
                name="displayStyle"
                value="toggle"
                checked={options.displayStyle === 'toggle'}
                onChange={(e) => updateOption('displayStyle', e.target.value)}
                className="h-4 w-4 rounded border-border text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
              />
              <span className="text-sm leading-6 text-foreground">Toggle switch</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:border-[var(--color-accent-blue-hover)] hover:bg-muted/40">
              <input
                type="radio"
                name="displayStyle"
                value="radio"
                checked={options.displayStyle === 'radio'}
                onChange={(e) => updateOption('displayStyle', e.target.value)}
                className="h-4 w-4 rounded border-border text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
              />
              <span className="text-sm leading-6 text-foreground">Radio buttons</span>
            </label>
          </div>
        </div>

        {/* Custom Labels */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">True label</label>
            <Input
              value={options.trueLabel}
              onChange={(e) => updateOption('trueLabel', e.target.value)}
              placeholder="Yes"
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">False label</label>
            <Input
              value={options.falseLabel}
              onChange={(e) => updateOption('falseLabel', e.target.value)}
              placeholder="No"
              className="h-11"
            />
          </div>
        </div>

        {/* Default Value */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Default value</p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:border-[var(--color-accent-blue-hover)] hover:bg-muted/40">
              <input
                type="radio"
                name="defaultValue"
                checked={options.defaultValue === true}
                onChange={() => updateOption('defaultValue', true)}
                className="h-4 w-4 rounded border-border text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
              />
              <span className="text-sm leading-6 text-foreground">{options.trueLabel}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:border-[var(--color-accent-blue-hover)] hover:bg-muted/40">
              <input
                type="radio"
                name="defaultValue"
                checked={options.defaultValue === false}
                onChange={() => updateOption('defaultValue', false)}
                className="h-4 w-4 rounded border-border text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
              />
              <span className="text-sm leading-6 text-foreground">{options.falseLabel}</span>
            </label>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-md border border-border/60 bg-background px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-3">
            {options.displayStyle === 'checkbox' && (
              <label className="flex cursor-default items-center gap-3">
                <input
                  type="checkbox"
                  checked={options.defaultValue}
                  readOnly
                  className="h-4 w-4 rounded border-border text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
                />
                <span className="text-sm leading-6 text-foreground">
                  {options.defaultValue ? options.trueLabel : options.falseLabel}
                </span>
              </label>
            )}

            {options.displayStyle === 'toggle' && (
              <div className="flex items-center gap-3">
                <div
                  className={`h-6 w-11 rounded-full border border-border/60 bg-muted transition-colors ${
                    options.defaultValue ? 'border-[var(--color-accent-blue)] bg-[var(--color-accent-blue-subtle)]' : ''
                  }`}
                >
                  <div
                    className={`h-5 w-5 translate-x-[2px] rounded-full bg-white shadow-sm transition-transform ${
                      options.defaultValue ? 'translate-x-[26px] bg-[var(--color-accent-blue)]' : ''
                    }`}
                  />
                </div>
                <span className="text-sm leading-6 text-foreground">
                  {options.defaultValue ? options.trueLabel : options.falseLabel}
                </span>
              </div>
            )}

            {options.displayStyle === 'radio' && (
              <div className="space-y-2">
                <label className="flex cursor-default items-center gap-3">
                  <input
                    type="radio"
                    name="preview"
                    checked={options.defaultValue === true}
                    readOnly
                    className="h-4 w-4 rounded-full border-border text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
                  />
                  <span className="text-sm leading-6 text-foreground">{options.trueLabel}</span>
                </label>
                <label className="flex cursor-default items-center gap-3">
                  <input
                    type="radio"
                    name="preview"
                    checked={options.defaultValue === false}
                    readOnly
                    className="h-4 w-4 rounded-full border-border text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
                  />
                  <span className="text-sm leading-6 text-foreground">{options.falseLabel}</span>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
