'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductField } from './DynamicFieldRenderer';

interface MeasurementUnitOption {
  value: string;
  label: string;
  symbol?: string;
  conversion_factor?: number;
}

interface ComponentSchemaEntry {
  key: string;
  label: string;
  description?: string;
}

interface ComponentValue {
  amount: string;
  unit: string;
}

type MeasurementState =
  | {
      kind: 'single';
      amount: string;
      unit: string;
    }
  | {
      kind: 'composite';
      components: Record<string, ComponentValue>;
    };

interface MeasurementFieldComponentProps {
  field: ProductField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
  className?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function MeasurementFieldComponent({
  field,
  value,
  onChange,
  disabled = false,
  className = ''
}: MeasurementFieldComponentProps) {
  const rawUnits = useMemo(() => {
    return Array.isArray(field.options?.units) ? field.options.units : [];
  }, [field.options?.units]);

  const units: MeasurementUnitOption[] = useMemo(() => {
    return rawUnits.flatMap<MeasurementUnitOption>((unit): MeasurementUnitOption[] => {
      if (typeof unit === 'string') {
        return [{ value: unit, label: unit, symbol: unit }];
      }

      if (!isRecord(unit)) return [];

      const value =
        (typeof unit.value === 'string' && unit.value) ||
        (typeof unit.code === 'string' && unit.code) ||
        (typeof unit.name === 'string' && unit.name) ||
        '';
      if (!value) return [];

      const label =
        (typeof unit.label === 'string' && unit.label) ||
        (typeof unit.name === 'string' && unit.name) ||
        (typeof unit.value === 'string' && unit.value) ||
        (typeof unit.code === 'string' && unit.code) ||
        value;
      const symbol = typeof unit.symbol === 'string' ? unit.symbol : undefined;
      const conversion_factor =
        typeof unit.conversion_factor === 'number'
          ? unit.conversion_factor
          : undefined;

      return [
        {
          value,
          label,
          symbol,
          conversion_factor
        }
      ];
    });
  }, [rawUnits]);

  const defaultUnit =
    field.options?.default_unit ||
    units[0]?.value ||
    (typeof rawUnits[0] === 'string' ? rawUnits[0] : rawUnits[0]?.value) ||
    '';

  const componentSchema: ComponentSchemaEntry[] = useMemo(() => {
    const rawComponentSchema = field.options?.component_schema;
    if (Array.isArray(rawComponentSchema)) {
      return rawComponentSchema.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.key !== 'string') return [];
        return [
          {
            key: entry.key,
            label:
              typeof entry.label === 'string' && entry.label
                ? entry.label
                : entry.key,
            description:
              typeof entry.description === 'string'
                ? entry.description
                : undefined
          }
        ];
      });
    }
    if (Array.isArray(field.options?.components)) {
      return field.options.components.flatMap((key) => {
        if (typeof key !== 'string') return [];
        return [
          {
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1)
          }
        ];
      });
    }
    return [];
  }, [field.options?.component_schema, field.options?.components]);

  const isComposite = !!field.options?.composite && componentSchema.length > 0;

  const normalizeValue = (incoming: unknown): MeasurementState => {
    const incomingRecord = isRecord(incoming) ? incoming : null;
    if (isComposite) {
      const components: Record<string, ComponentValue> = {};
      componentSchema.forEach((component) => {
        const incomingComponents = isRecord(incomingRecord?.components)
          ? incomingRecord.components
          : null;
        const existing = incomingComponents?.[component.key] ?? incomingRecord?.[component.key];
        const existingRecord = isRecord(existing) ? existing : null;
        const amount =
          existingRecord
            ? (existingRecord.amount ?? existingRecord.value ?? '')
            : existing ?? '';
        const unit =
          existingRecord
            ? existingRecord.unit ?? defaultUnit
            : incomingRecord?.unit ?? defaultUnit;

        components[component.key] = {
          amount: amount === null || amount === undefined ? '' : String(amount),
          unit: unit || defaultUnit
        };
      });

      return {
        kind: 'composite',
        components
      };
    }

    const amount =
      incomingRecord
        ? incomingRecord.amount ?? incomingRecord.value ?? incomingRecord.measurement ?? ''
        : incoming ?? '';

    const unit =
      (incomingRecord && (incomingRecord.unit ?? incomingRecord.default_unit)) ||
      defaultUnit;

    return {
      kind: 'single',
      amount: amount === null || amount === undefined ? '' : String(amount),
      unit: unit || defaultUnit
    };
  };

  const [currentValue, setCurrentValue] = useState<MeasurementState>(normalizeValue(value));

  useEffect(() => {
    setCurrentValue(normalizeValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isComposite, defaultUnit, JSON.stringify(componentSchema), units.map(u => u.value).join('|')]);

  const emitChange = (nextState: MeasurementState) => {
    setCurrentValue(nextState);
    if (!onChange) return;

    if (nextState.kind === 'single') {
      onChange({
        amount: nextState.amount,
        unit: nextState.unit
      });
      return;
    }

    const payloadComponents: Record<string, ComponentValue> = {};
    Object.entries(nextState.components).forEach(([key, component]) => {
      payloadComponents[key] = {
        amount: component.amount,
        unit: component.unit
      };
    });

    const representativeComponent = Object.values(nextState.components)[0];

    onChange({
      unit: representativeComponent?.unit ?? defaultUnit,
      components: payloadComponents
    });
  };

  const handleAmountChange = (amount: string) => {
    if (currentValue.kind !== 'single') return;
    emitChange({
      kind: 'single',
      amount,
      unit: currentValue.unit
    });
  };

  const handleUnitChange = (unit: string) => {
    if (currentValue.kind !== 'single') return;
    emitChange({
      kind: 'single',
      amount: currentValue.amount,
      unit
    });
  };

  const handleComponentAmountChange = (componentKey: string, amount: string) => {
    if (currentValue.kind !== 'composite') return;
    emitChange({
      kind: 'composite',
      components: {
        ...currentValue.components,
        [componentKey]: {
          ...currentValue.components[componentKey],
          amount
        }
      }
    });
  };

  const handleComponentUnitChange = (componentKey: string, unit: string) => {
    if (currentValue.kind !== 'composite') return;
    emitChange({
      kind: 'composite',
      components: {
        ...currentValue.components,
        [componentKey]: {
          ...currentValue.components[componentKey],
          unit
        }
      }
    });
  };

  const decimalPlaces = typeof field.options?.decimal_places === 'number' ? field.options.decimal_places : undefined;
  const step = decimalPlaces !== undefined ? Number((1 / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces)) : 'any';

  const allowNegative = !!field.options?.allow_negative;
  const minValue =
    field.options?.min_value !== undefined
      ? field.options.min_value
      : allowNegative
      ? undefined
      : 0;
  const maxValue = field.options?.max_value;

  const renderSingleInput = () => (
    <div className="flex gap-2">
      <div className="flex-1">
        <Input
          type="number"
          value={currentValue.kind === 'single' ? currentValue.amount : ''}
          onChange={(event) => handleAmountChange(event.target.value)}
          placeholder={field.description || 'Enter amount'}
          disabled={disabled}
          min={minValue}
          max={maxValue}
          step={step}
          className="h-10"
        />
      </div>

      {units.length > 0 && (
        <div className="w-28">
          <Select
            value={currentValue.kind === 'single' ? currentValue.unit : defaultUnit}
            onValueChange={handleUnitChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label} {unit.symbol ? `(${unit.symbol})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  const renderCompositeInputs = () => (
    <div className="space-y-3">
      {componentSchema.map((component) => {
        const componentValue = currentValue.kind === 'composite'
          ? currentValue.components[component.key]
          : { amount: '', unit: defaultUnit };

        return (
          <div key={component.key} className="rounded-md border border-border/60 bg-background/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{component.label}</span>
              {component.description && (
                <span className="text-xs text-muted-foreground">{component.description}</span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="number"
                  value={componentValue?.amount ?? ''}
                  onChange={(event) => handleComponentAmountChange(component.key, event.target.value)}
                  placeholder={`Enter ${component.label.toLowerCase()}`}
                  disabled={disabled}
                  min={minValue}
                  max={maxValue}
                  step={step}
                  className="h-10"
                />
              </div>

              {units.length > 0 && (
                <div className="w-28">
                  <Select
                    value={componentValue?.unit ?? defaultUnit}
                    onValueChange={(value) => handleComponentUnitChange(component.key, value)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.label} {unit.symbol ? `(${unit.symbol})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {isComposite ? renderCompositeInputs() : renderSingleInput()}

      {(minValue !== undefined || maxValue !== undefined) && (
        <div className="text-xs text-muted-foreground">
          {minValue !== undefined && maxValue !== undefined
            ? `Range: ${minValue} - ${maxValue}`
            : minValue !== undefined
            ? `Minimum: ${minValue}`
            : `Maximum: ${maxValue}`}
        </div>
      )}

      {field.options?.conversion_note && (
        <div className="text-xs text-muted-foreground">
          {field.options.conversion_note}
        </div>
      )}
    </div>
  );
}
