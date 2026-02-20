'use client';

'use client';

import { useState } from 'react';
import { List, Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';

interface SelectOption {
  id: string;
  label: string;
  value: string;
  sort_order?: number;
}

interface MultiSelectFieldOptions {
  options: SelectOption[];
  allowEmpty?: boolean;
  placeholder?: string;
  defaultValue?: string[];
  max_selections?: number;
  min_selections?: number;
}

interface MultiSelectFieldProps {
  value?: MultiSelectFieldOptions;
  onChange: (options: MultiSelectFieldOptions) => void;
}

export default function MultiSelectField({
  value: initialValue = { options: [] },
  onChange
}: MultiSelectFieldProps) {
  const [fieldOptions, setFieldOptions] = useState<MultiSelectFieldOptions>({
    allowEmpty: true,
    placeholder: 'Select options...',
    defaultValue: [],
    max_selections: undefined,
    min_selections: undefined,
    ...initialValue
  });

  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [previewValues, setPreviewValues] = useState<string[]>(fieldOptions.defaultValue || []);

  const updateOptions = (newOptions: Partial<MultiSelectFieldOptions>) => {
    const updated = { ...fieldOptions, ...newOptions };
    setFieldOptions(updated);
    onChange(updated);
  };

  const generateValue = (label: string): string => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  };

  const addOption = () => {
    if (!newOptionLabel.trim()) return;

    const trimmed = newOptionLabel.trim();
    const newOption: SelectOption = {
      id: Date.now().toString(),
      label: trimmed,
      value: generateValue(trimmed),
      sort_order: fieldOptions.options.length + 1
    };

    updateOptions({
      options: [...fieldOptions.options, newOption]
    });
    setNewOptionLabel('');
  };

  const removeOption = (id: string) => {
    const removedOption = fieldOptions.options.find((opt) => opt.id === id);

    if (removedOption) {
      setPreviewValues((prev) => prev.filter((value) => value !== removedOption.value));
    }

    updateOptions({
      options: fieldOptions.options.filter((opt) => opt.id !== id)
    });
  };

  const updateOption = (id: string, updates: Partial<SelectOption>) => {
    updateOptions({
      options: fieldOptions.options.map((opt) =>
        opt.id === id ? { ...opt, ...updates } : opt
      )
    });
  };

  const moveOption = (id: string, direction: 'up' | 'down') => {
    const currentIndex = fieldOptions.options.findIndex((opt) => opt.id === id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= fieldOptions.options.length) return;

    const reordered = [...fieldOptions.options];
    [reordered[currentIndex], reordered[newIndex]] = [reordered[newIndex], reordered[currentIndex]];

    reordered.forEach((opt, idx) => {
      opt.sort_order = idx + 1;
    });

    updateOptions({ options: reordered });
  };

  const togglePreviewValue = (value: string) => {
    setPreviewValues((prev) => {
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value);
      }

      if (fieldOptions.max_selections && prev.length >= fieldOptions.max_selections) {
        return prev;
      }

      return [...prev, value];
    });
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <List className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Multiple choice dropdown</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Configure available options, selection limits, and the default behaviour for this field.
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
              placeholder="Select options..."
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Max selections</label>
            <Input
              type="number"
              min={1}
              value={fieldOptions.max_selections ?? ''}
              onChange={(e) =>
                updateOptions({
                  max_selections: e.target.value ? parseInt(e.target.value, 10) : undefined
                })
              }
              placeholder="No limit"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">Leave blank to allow unlimited selections.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Minimum selections</label>
            <Input
              type="number"
              min={0}
              value={fieldOptions.min_selections ?? ''}
              onChange={(e) =>
                updateOptions({
                  min_selections: e.target.value ? parseInt(e.target.value, 10) : undefined
                })
              }
              placeholder="0"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Set how many choices must be selected before saving.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition-colors hover:bg-muted/40">
            <input
              type="checkbox"
              checked={fieldOptions.allowEmpty}
              onChange={(e) => updateOptions({ allowEmpty: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm leading-6 text-foreground">Allow empty selection (optional field)</span>
          </label>
        </div>

        <div className="rounded-lg border border-dashed border-border/60 bg-background px-5 py-4">
          <p className="text-sm font-medium text-foreground">Add option</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={newOptionLabel}
              onChange={(e) => setNewOptionLabel(e.target.value)}
              placeholder='Option label (e.g. "Red", "Blue", "Green")'
              className="h-11 flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
            <Button onClick={addOption} variant="outline" className="h-11 sm:w-auto">
              <Plus className="h-4 w-4" />
              <span className="ml-2 text-sm font-medium">Add</span>
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Press Enter or use the button to add an option.</p>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>

          {previewValues.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {previewValues.map((value) => {
                const option = fieldOptions.options.find((opt) => opt.value === value);
                return (
                  <Badge key={value} variant="secondary" className="flex items-center gap-1 text-xs">
                    {option?.label || value}
                    <button
                      type="button"
                      onClick={() => togglePreviewValue(value)}
                      className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          <MultiSelect
            options={fieldOptions.options.map((opt) => ({
              value: opt.value,
              label: opt.label
            }))}
            value={previewValues}
            onChange={setPreviewValues}
            placeholder="Select options"
            className="mt-4"
          />

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{fieldOptions.options.length} options</span>
            {fieldOptions.min_selections !== undefined && <span>Min: {fieldOptions.min_selections}</span>}
            {fieldOptions.max_selections !== undefined && <span>Max: {fieldOptions.max_selections}</span>}
            <span>{previewValues.length} selected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
