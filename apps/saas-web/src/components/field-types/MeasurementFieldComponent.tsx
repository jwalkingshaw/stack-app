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
  value?: any;
  onChange?: (value: any) => void;
  disabled?: boolean;
  className?: string;
}

export function MeasurementFieldComponent({
  field,
  value,
  onChange,
  disabled = false,
  className = ''
}: MeasurementFieldComponentProps) {
  const rawUnits = field.options?.units || [];

  const units: MeasurementUnitOption[] = useMemo(() => {
    return rawUnits.map((unit: any) => {
      if (typeof unit === 'string') {
        return { value: unit, label: unit, symbol: unit };
      }
      return {
        value: unit.value || unit.code || unit.name,
        label: unit.label || unit.name || unit.value || unit.code,
        symbol: unit.symbol,
        conversion_factor: unit.conversion_factor
      };
    });
  }, [rawUnits]);

  const defaultUnit =
    field.options?.default_unit ||
    units[0]?.value ||
    (typeof rawUnits[0] === 'string' ? rawUnits[0] : rawUnits[0]?.value) ||
    '';

  const componentSchema: ComponentSchemaEntry[] = useMemo(() => {
    if (Array.isArray(field.options?.component_schema)) {
      return field.options.component_schema as ComponentSchemaEntry[];
    }
    if (Array.isArray(field.options?.components)) {
      return (field.options.components as string[]).map((key) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1)
      }));
    }
    return [];
  }, [field.options?.component_schema, field.options?.components]);

  const isComposite = !!field.options?.composite && componentSchema.length > 0;

  const normalizeValue = (incoming: any): MeasurementState => {
    if (isComposite) {
      const components: Record<string, ComponentValue> = {};
      componentSchema.forEach((component) => {
        const existing = incoming?.components?.[component.key] ?? incoming?.[component.key];
        const amount =
          typeof existing === 'object'
            ? (existing.amount ?? existing.value ?? '')
            : existing ?? '';
        const unit =
          typeof existing === 'object'
            ? existing.unit ?? defaultUnit
            : incoming?.unit ?? defaultUnit;

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
      incoming && typeof incoming === 'object'
        ? incoming.amount ?? incoming.value ?? incoming.measurement ?? ''
        : incoming ?? '';

    const unit =
      (incoming && typeof incoming === 'object' && (incoming.unit ?? incoming.default_unit)) ||
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

    const payloadComponents: Record<string, any> = {};
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
