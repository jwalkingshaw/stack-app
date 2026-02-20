'use client';

import { useState, useMemo } from 'react';
import { Type } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TextFieldProps {
  value?: {
    max_length?: number;
    field_purpose?: string;
    serving_type?: string;
    serving_unit?: string;
  };
  onChange?: (value: any) => void;
}

const SERVING_TYPE_OPTIONS = [
  {
    value: 'serving_size',
    label: 'Serving Size (e.g. "2 capsules", "12g")'
  },
  {
    value: 'servings_per_container',
    label: 'Servings per Container (e.g. "30", "60")'
  }
];

const SERVING_UNITS = [
  { value: '', label: 'No unit (just numbers)' },
  { value: 'g', label: 'Grams (g)' },
  { value: 'ml', label: 'Millilitres (ml)' },
  { value: 'oz', label: 'Ounces (oz)' },
  { value: 'fl_oz', label: 'Fluid ounces (fl oz)' },
  { value: 'capsules', label: 'Capsules' },
  { value: 'tablets', label: 'Tablets' },
  { value: 'scoops', label: 'Scoops' },
  { value: 'packets', label: 'Packets' },
  { value: 'gummies', label: 'Gummies' },
  { value: 'softgels', label: 'Softgels' },
  { value: 'drops', label: 'Drops' },
  { value: 'pumps', label: 'Pumps' },
  { value: 'cans', label: 'Cans' },
  { value: 'bottles', label: 'Bottles' }
];

const SERVING_COUNT_UNITS = [
  { value: '', label: 'No unit (just numbers)' },
  { value: 'servings', label: 'Servings' }
];

export default function TextField({ value, onChange }: TextFieldProps) {
  const [maxLength, setMaxLength] = useState<number>(value?.max_length ?? 255);
  const [fieldPurpose, setFieldPurpose] = useState<string>(value?.field_purpose ?? 'general');
  const [servingType, setServingType] = useState<string>(value?.serving_type ?? 'serving_size');
  const [servingUnit, setServingUnit] = useState<string>(value?.serving_unit ?? '');

  const availableServingUnits = useMemo(
    () => (servingType === 'servings_per_container' ? SERVING_COUNT_UNITS : SERVING_UNITS),
    [servingType]
  );

  const updateValue = (changes: Partial<NonNullable<TextFieldProps['value']>>) => {
    onChange?.({
      ...value,
      ...changes
    });
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Type className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Single-line text input</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Control maximum length or capture serving information with units.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Maximum character length</label>
          <Input
            type="number"
            value={maxLength}
            onChange={(event) => {
              const next = Number(event.target.value) || 255;
              setMaxLength(next);
              updateValue({ max_length: next });
            }}
            min={1}
            max={65535}
            className="h-11 w-32"
          />
          <p className="text-xs text-muted-foreground">Default is 255 characters.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Field purpose</label>
          <Select
            value={fieldPurpose}
            onValueChange={(next) => {
              setFieldPurpose(next);
              updateValue({ field_purpose: next });
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General text</SelectItem>
              <SelectItem value="serving">Serving information</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {fieldPurpose === 'serving' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Serving type</label>
              <Select
                value={servingType}
                onValueChange={(nextType) => {
                  setServingType(nextType);
                  updateValue({ serving_type: nextType });
                  const units = nextType === 'servings_per_container' ? SERVING_COUNT_UNITS : SERVING_UNITS;
                  if (!units.some((unit) => unit.value === servingUnit)) {
                    const fallback = units[0]?.value ?? '';
                    setServingUnit(fallback);
                    updateValue({ serving_unit: fallback });
                  }
                }}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVING_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Unit</label>
              <Select
                value={servingUnit}
                onValueChange={(nextUnit) => {
                  setServingUnit(nextUnit);
                  updateValue({ serving_unit: nextUnit });
                }}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableServingUnits.map((unit) => (
                    <SelectItem key={unit.value} value={unit.value}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {servingUnit
                  ? `Values will be stored as "number + ${servingUnit}" (e.g. "2 ${servingUnit}").`
                  : 'Values will be stored as numbers only (e.g. "30", "60").'}
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-background px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Serving type:</span>{' '}
                  {servingType === 'serving_size' ? 'Serving size' : 'Servings per container'}
                </p>
                <p>
                  <span className="font-medium text-foreground">Unit:</span>{' '}
                  {servingUnit
                    ? availableServingUnits.find((unit) => unit.value === servingUnit)?.label ?? servingUnit
                    : 'No unit (numbers only)'}
                </p>
                <p>
                  <span className="font-medium text-foreground">Example values:</span>{' '}
                  {servingType === 'serving_size' && servingUnit
                    ? `"2 ${servingUnit}", "1 ${servingUnit}"`
                    : servingType === 'serving_size'
                    ? '"12", "15", "2"'
                    : servingUnit
                    ? `"30 ${servingUnit}", "60 ${servingUnit}"`
                    : '"30", "60", "90"'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
