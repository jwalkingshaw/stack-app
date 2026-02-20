'use client';

import { useMemo, useState } from 'react';
import { List, Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SelectOption {
  id: string;
  label: string;
  value: string;
  sort_order?: number;
}

interface SelectFieldOptions {
  options: SelectOption[];
  allowEmpty?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

interface SelectFieldProps {
  value?: SelectFieldOptions;
  onChange: (options: SelectFieldOptions) => void;
}

export default function SelectField({
  value: initialValue = { options: [] },
  onChange
}: SelectFieldProps) {
  const [fieldOptions, setFieldOptions] = useState<SelectFieldOptions>({
    allowEmpty: true,
    placeholder: 'Select an option...',
    defaultValue: '',
    ...initialValue
  });
  const [newOptionLabel, setNewOptionLabel] = useState('');

  const updateOptions = (updates: Partial<SelectFieldOptions>) => {
    const merged = { ...fieldOptions, ...updates };
    setFieldOptions(merged);
    onChange(merged);
  };

  const generateValue = (label: string) =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);

  const addOption = () => {
    if (!newOptionLabel.trim()) return;

    const trimmed = newOptionLabel.trim();
    const option: SelectOption = {
      id: Date.now().toString(),
      label: trimmed,
      value: generateValue(trimmed),
      sort_order: fieldOptions.options.length + 1
    };

    updateOptions({ options: [...fieldOptions.options, option] });
    setNewOptionLabel('');
  };

  const removeOption = (id: string) => {
    const remaining = fieldOptions.options.filter((opt) => opt.id !== id);
    const currentDefault = fieldOptions.defaultValue;
    const defaultRemoved =
      currentDefault && !remaining.some((opt) => opt.value === currentDefault);

    updateOptions({
      options: remaining,
      defaultValue: defaultRemoved ? '' : currentDefault
    });
  };

  const updateOption = (id: string, updates: Partial<SelectOption>) => {
    const updated = fieldOptions.options.map((opt) =>
      opt.id === id ? { ...opt, ...updates } : opt
    );

    let nextDefault = fieldOptions.defaultValue;
    if (updates.value && fieldOptions.defaultValue) {
      const original = fieldOptions.options.find((opt) => opt.id === id);
      if (original?.value === fieldOptions.defaultValue) {
        nextDefault = updates.value;
      }
    }

    updateOptions({ options: updated, defaultValue: nextDefault });
  };

  const moveOption = (id: string, direction: 'up' | 'down') => {
    const currentIndex = fieldOptions.options.findIndex((opt) => opt.id === id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= fieldOptions.options.length) return;

    const swapped = [...fieldOptions.options];
    [swapped[currentIndex], swapped[newIndex]] = [swapped[newIndex], swapped[currentIndex]];
    swapped.forEach((opt, idx) => (opt.sort_order = idx + 1));
    updateOptions({ options: swapped });
  };

  const defaultLabel = useMemo(() => {
    if (!fieldOptions.defaultValue) return '';
    return fieldOptions.options.find((opt) => opt.value === fieldOptions.defaultValue)?.label || '';
  }, [fieldOptions.defaultValue, fieldOptions.options]);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <List className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Single choice dropdown</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Define the list of options and set a default selection for this field.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Placeholder text</label>
            <Input
              value={fieldOptions.placeholder}
              onChange={(e) => updateOptions({ placeholder: e.target.value })}
              placeholder="Select an option..."
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Default value</label>
            <Select
              value={fieldOptions.defaultValue ?? ''}
              onValueChange={(value) => updateOptions({ defaultValue: value })}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="No default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No default</SelectItem>
                {fieldOptions.options.map((opt) => (
                  <SelectItem key={opt.id} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose a value to prefill when creating products.
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={fieldOptions.allowEmpty ?? true}
            onChange={(e) => updateOptions({ allowEmpty: e.target.checked })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm leading-6 text-foreground">
            Allow empty selection (optional field)
          </span>
        </label>

        <div className="rounded-lg border border-dashed border-border/60 bg-background px-5 py-4">
          <p className="text-sm font-medium text-foreground">Add option</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={newOptionLabel}
              onChange={(e) => setNewOptionLabel(e.target.value)}
              placeholder='Option label (e.g. "Small", "Medium", "Large")'
              className="h-11 flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
            <Button
              type="button"
              onClick={addOption}
              disabled={!newOptionLabel.trim()}
              variant="outline"
              className="h-11 sm:w-auto disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              <span className="ml-2 text-sm font-medium">Add</span>
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Press Enter or use the button to add an option.
          </p>
        </div>

        {fieldOptions.options.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              Options <span className="text-muted-foreground">({fieldOptions.options.length})</span>
            </h4>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {fieldOptions.options.map((option, index) => (
                <div
                  key={option.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 shadow-sm sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="flex items-center gap-1 self-start">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveOption(option.id, 'up')}
                      disabled={index === 0}
                      className="h-8 w-8 disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveOption(option.id, 'down')}
                      disabled={index === fieldOptions.options.length - 1}
                      className="h-8 w-8 disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground">Label</label>
                      <Input
                        value={option.label}
                        onChange={(e) => {
                          const newLabel = e.target.value;
                          updateOption(option.id, {
                            label: newLabel,
                            value: generateValue(newLabel)
                          });
                        }}
                        className="mt-1 h-10"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground">Value</label>
                      <Input
                        value={option.value}
                        onChange={(e) => updateOption(option.id, { value: e.target.value })}
                        className="mt-1 h-10 font-mono text-sm"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(option.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-background px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview
          </p>
          <Select
            value={fieldOptions.defaultValue ?? ''}
            onValueChange={(value) => updateOptions({ defaultValue: value })}
          >
            <SelectTrigger className="mt-3 h-11">
              <SelectValue placeholder={fieldOptions.placeholder || 'Select an option...'} />
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.allowEmpty && (
                <SelectItem value="">{fieldOptions.placeholder || 'Select an option...'}</SelectItem>
              )}
              {fieldOptions.options.map((opt) => (
                <SelectItem key={opt.id} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{fieldOptions.options.length} options</span>
            {defaultLabel && <span>Default: {defaultLabel}</span>}
            {fieldOptions.allowEmpty && <span>Optional field</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
