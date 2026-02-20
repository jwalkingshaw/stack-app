'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertTriangle, Loader2, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MeasurementUnit {
  id: string;
  code: string;
  name: string;
  symbol: string;
  conversion_factor: number;
  is_active?: boolean;
}

interface MeasurementComponentSchema {
  key: string;
  label: string;
  description?: string;
}

interface MeasurementFamily {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_composite: boolean;
  component_schema: MeasurementComponentSchema[];
  default_decimal_precision?: number;
  allow_negative: boolean;
  metadata?: Record<string, any>;
  standard_unit?: MeasurementUnit | null;
  measurement_units: MeasurementUnit[];
}

interface MeasurementFieldProps {
  field?: any;
  value?: {
    measurement_family?: string;
    default_unit?: string;
    allowed_units?: string[];
    composite?: boolean;
    components?: string[];
    component_schema?: MeasurementComponentSchema[];
    decimal_places?: number;
    allow_negative?: boolean;
    conversion_note?: string;
    standard_unit?: {
      value: string;
      label: string;
      symbol: string;
    };
    units?: Array<{
      value: string;
      label: string;
      symbol: string;
      conversion_factor: number;
    }>;
  };
  onChange?: (value: any) => void;
  tenantSlug?: string;
}

type LoadState = 'idle' | 'loading' | 'error';

const MAX_DECIMAL_PLACES = 6;

const arraysShallowEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export default function MeasurementField({ value, onChange, tenantSlug }: MeasurementFieldProps) {
  const [measurementFamilies, setMeasurementFamilies] = useState<MeasurementFamily[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedFamily, setSelectedFamily] = useState<string>(value?.measurement_family || '');
  const [allowedUnits, setAllowedUnits] = useState<string[]>(value?.allowed_units || []);
  const [defaultUnit, setDefaultUnit] = useState<string>(value?.default_unit || '');
  const [decimalPlaces, setDecimalPlaces] = useState<number | null>(
    typeof value?.decimal_places === 'number' ? value.decimal_places : null
  );
  const [allowNegative, setAllowNegative] = useState<boolean>(value?.allow_negative ?? false);
  const [selectedComponents, setSelectedComponents] = useState<string[]>(
    Array.isArray(value?.components) ? value.components : []
  );

  const hasInitializedFromValue = useRef(false);
  const previousFamilyRef = useRef<string>('');
  const lastEmittedPayload = useRef<string | null>(null);
  const lastAppliedValueRef = useRef<string | null>(null);
  const serializedIncomingValue = useMemo(() => {
    try {
      return JSON.stringify(value ?? {});
    } catch (error) {
      console.warn('Unable to serialize measurement field value:', error);
      return '';
    }
  }, [value]);

  const allowedUnitsRef = useRef(allowedUnits);
  const defaultUnitRef = useRef(defaultUnit);
  const decimalPlacesRef = useRef(decimalPlaces);
  const allowNegativeRef = useRef(allowNegative);
  const selectedComponentsRef = useRef(selectedComponents);

  useEffect(() => {
    allowedUnitsRef.current = allowedUnits;
  }, [allowedUnits]);

  useEffect(() => {
    defaultUnitRef.current = defaultUnit;
  }, [defaultUnit]);

  useEffect(() => {
    decimalPlacesRef.current = decimalPlaces;
  }, [decimalPlaces]);

  useEffect(() => {
    allowNegativeRef.current = allowNegative;
  }, [allowNegative]);

  useEffect(() => {
    selectedComponentsRef.current = selectedComponents;
  }, [selectedComponents]);

  const fetchMeasurementFamilies = useCallback(async () => {
    if (!tenantSlug) {
      setMeasurementFamilies([]);
      setLoadState('idle');
      return;
    }

    try {
      setLoadState('loading');
      setErrorMessage(null);
      const response = await fetch(`/api/${tenantSlug}/measurement-families`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to load measurement families.');
      }
      const families: MeasurementFamily[] = await response.json();
      setMeasurementFamilies(families);
      setLoadState('idle');
    } catch (error) {
      console.error('Error fetching measurement families:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load measurement families.');
      setLoadState('error');
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchMeasurementFamilies();
  }, [fetchMeasurementFamilies]);

  useEffect(() => {
    if (serializedIncomingValue === lastAppliedValueRef.current) {
      return;
    }
    lastAppliedValueRef.current = serializedIncomingValue;

    if (!value || Object.keys(value).length === 0) {
      if (selectedFamily !== '') setSelectedFamily('');
      if (allowedUnits.length !== 0) setAllowedUnits([]);
      if (defaultUnit !== '') setDefaultUnit('');
      if (decimalPlaces !== null) setDecimalPlaces(null);
      if (allowNegative !== false) setAllowNegative(false);
      if (selectedComponents.length !== 0) setSelectedComponents([]);
      hasInitializedFromValue.current = true;
      return;
    }

    const nextSelectedFamily = value.measurement_family || '';
    if (nextSelectedFamily !== selectedFamily) {
      setSelectedFamily(nextSelectedFamily);
    }

    const nextAllowedUnits = Array.isArray(value.allowed_units) ? value.allowed_units : [];
    if (!arraysShallowEqual(nextAllowedUnits, allowedUnits)) {
      setAllowedUnits(nextAllowedUnits);
    }

    const nextDefaultUnit = value.default_unit || '';
    if (nextDefaultUnit !== defaultUnit) {
      setDefaultUnit(nextDefaultUnit);
    }

    const nextDecimalPlaces =
      typeof value.decimal_places === 'number' ? value.decimal_places : null;
    if (nextDecimalPlaces !== decimalPlaces) {
      setDecimalPlaces(nextDecimalPlaces);
    }

    const nextAllowNegative = value.allow_negative ?? false;
    if (nextAllowNegative !== allowNegative) {
      setAllowNegative(nextAllowNegative);
    }

    const nextComponents = Array.isArray(value.components) ? value.components : [];
    if (!arraysShallowEqual(nextComponents, selectedComponents)) {
      setSelectedComponents(nextComponents);
    }

    hasInitializedFromValue.current = true;
  }, [
    serializedIncomingValue,
    value,
    selectedFamily,
    allowedUnits,
    defaultUnit,
    decimalPlaces,
    allowNegative,
    selectedComponents
  ]);

  const selectedFamilyData = useMemo(
    () => measurementFamilies.find(family => family.code === selectedFamily),
    [measurementFamilies, selectedFamily]
  );

  useEffect(() => {
    if (!selectedFamilyData) {
      return;
    }

    const familyUnits = selectedFamilyData.measurement_units.map(unit => unit.code);

    const preferredAllowedUnits = hasInitializedFromValue.current &&
      Array.isArray(value?.allowed_units) &&
      value.measurement_family === selectedFamilyData.code
        ? value.allowed_units.filter(code => familyUnits.includes(code))
        : [];

    let workingAllowedUnits = allowedUnitsRef.current.filter(code => familyUnits.includes(code));
    const nextAllowedUnits =
      preferredAllowedUnits.length > 0
        ? preferredAllowedUnits
        : workingAllowedUnits.length > 0
        ? workingAllowedUnits
        : familyUnits;

    if (!arraysShallowEqual(nextAllowedUnits, allowedUnitsRef.current)) {
      workingAllowedUnits = nextAllowedUnits;
      setAllowedUnits(nextAllowedUnits);
    }

    const preferredDefaultUnit =
      hasInitializedFromValue.current &&
      value?.default_unit &&
      value.measurement_family === selectedFamilyData.code &&
      familyUnits.includes(value.default_unit)
        ? value.default_unit
        : undefined;

    let workingDefaultUnit = defaultUnitRef.current;
    const nextDefaultUnit =
      preferredDefaultUnit ||
      (selectedFamilyData.standard_unit?.code && workingAllowedUnits.includes(selectedFamilyData.standard_unit.code)
        ? selectedFamilyData.standard_unit.code
        : workingAllowedUnits[0] || '');

    if (workingDefaultUnit !== nextDefaultUnit) {
      workingDefaultUnit = nextDefaultUnit;
      setDefaultUnit(nextDefaultUnit);
    }

    const preferredDecimalPlaces =
      hasInitializedFromValue.current &&
      typeof value?.decimal_places === 'number' &&
      value.measurement_family === selectedFamilyData.code
        ? value.decimal_places
        : null;

    let workingDecimalPlaces = decimalPlacesRef.current;
    if (preferredDecimalPlaces !== null && preferredDecimalPlaces !== workingDecimalPlaces) {
      workingDecimalPlaces = preferredDecimalPlaces;
      setDecimalPlaces(preferredDecimalPlaces);
    }

    if (selectedFamilyData.is_composite) {
      const schemaKeys = selectedFamilyData.component_schema.map(component => component.key);

      const preferredComponents = hasInitializedFromValue.current &&
        Array.isArray(value?.components) &&
        value.measurement_family === selectedFamilyData.code
          ? value.components.filter(key => schemaKeys.includes(key))
          : [];

      const currentComponents = selectedComponentsRef.current.filter(key => schemaKeys.includes(key));
      const nextComponents =
        preferredComponents.length > 0
          ? preferredComponents
          : currentComponents.length > 0
          ? currentComponents
          : schemaKeys;

      if (!arraysShallowEqual(nextComponents, selectedComponentsRef.current)) {
        setSelectedComponents(nextComponents);
      }
    } else if (selectedComponentsRef.current.length !== 0) {
      setSelectedComponents([]);
    }

    const previousFamily = previousFamilyRef.current;
    if (previousFamily !== selectedFamilyData.code) {
      if (!(hasInitializedFromValue.current && value?.measurement_family === selectedFamilyData.code && typeof value?.allow_negative === 'boolean')) {
        const desiredAllowNegative = !!selectedFamilyData.allow_negative;
        if (allowNegativeRef.current !== desiredAllowNegative) {
          setAllowNegative(desiredAllowNegative);
        }
      }
      previousFamilyRef.current = selectedFamilyData.code;
    }
  }, [selectedFamilyData, serializedIncomingValue, value]);

  useEffect(() => {
    if (!onChange) {
      return;
    }

    if (!selectedFamily) {
      const emptySerialized = '{}';
      if (lastEmittedPayload.current !== emptySerialized) {
        lastEmittedPayload.current = emptySerialized;
        onChange({});
      }
      return;
    }

    const family = measurementFamilies.find(f => f.code === selectedFamily);
    if (!family) {
      return;
    }

    const familyUnitCodes = family.measurement_units.map(unit => unit.code);
    const sanitizedAllowedUnits = allowedUnits.filter(code => familyUnitCodes.includes(code));
    const finalAllowedUnits = sanitizedAllowedUnits.length > 0 ? sanitizedAllowedUnits : familyUnitCodes;

    const resolvedDefaultUnit = finalAllowedUnits.includes(defaultUnit)
      ? defaultUnit
      : (family.standard_unit?.code && finalAllowedUnits.includes(family.standard_unit.code)
        ? family.standard_unit.code
        : finalAllowedUnits[0] || '');

    const resolvedDecimalPlaces =
      decimalPlaces !== null
        ? Math.max(0, Math.min(MAX_DECIMAL_PLACES, decimalPlaces))
        : (family.default_decimal_precision ?? 2);

    const componentKeys = family.is_composite
      ? (selectedComponents.length
        ? selectedComponents.filter(key => family.component_schema.some(component => component.key === key))
        : family.component_schema.map(component => component.key))
      : [];

    const componentSchema = family.is_composite
      ? family.component_schema.filter(component => componentKeys.includes(component.key))
      : [];

    const unitsForOptions = finalAllowedUnits
      .map(code => family.measurement_units.find(unit => unit.code === code))
      .filter((unit): unit is MeasurementUnit => Boolean(unit))
      .map(unit => ({
        value: unit.code,
        label: unit.name,
        symbol: unit.symbol,
        conversion_factor: unit.conversion_factor
      }));

    const payload: Record<string, any> = {
      measurement_family: family.code,
      default_unit: resolvedDefaultUnit,
      allowed_units: finalAllowedUnits,
      units: unitsForOptions,
      decimal_places: resolvedDecimalPlaces,
      allow_negative: allowNegative,
      composite: family.is_composite,
      conversion_note: family.metadata?.conversion_note
    };

    if (family.standard_unit) {
      payload.standard_unit = {
        value: family.standard_unit.code,
        label: family.standard_unit.name,
        symbol: family.standard_unit.symbol
      };
    }

    if (family.is_composite) {
      payload.components = componentKeys;
      payload.component_schema = componentSchema;
    }

    const serialized = JSON.stringify(payload);
    if (lastEmittedPayload.current !== serialized) {
      lastEmittedPayload.current = serialized;
      onChange({ ...payload });
    }
  }, [
    selectedFamily,
    allowedUnits,
    defaultUnit,
    decimalPlaces,
    allowNegative,
    selectedComponents,
    measurementFamilies,
    onChange
  ]);

  const handleFamilyChange = (familyCode: string) => {
    setSelectedFamily(familyCode);
    if (!familyCode) {
      setAllowedUnits([]);
      setDefaultUnit('');
      setDecimalPlaces(null);
      setAllowNegative(false);
      setSelectedComponents([]);
    }
  };

  const toggleAllowedUnit = (unitCode: string) => {
    if (!selectedFamilyData) return;

    setAllowedUnits(prev => {
      const exists = prev.includes(unitCode);
      if (exists) {
        if (prev.length === 1) {
          return prev;
        }
        const next = prev.filter(code => code !== unitCode);
        if (!next.includes(defaultUnit)) {
          setDefaultUnit(next[0] || unitCode);
        }
        return next;
      }
      return [...prev, unitCode];
    });
  };

  const toggleComponent = (componentKey: string) => {
    setSelectedComponents(prev => {
      const exists = prev.includes(componentKey);
      if (exists) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter(key => key !== componentKey);
      }
      return [...prev, componentKey];
    });
  };

  const handleDecimalPlacesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === '') {
      setDecimalPlaces(null);
      return;
    }

    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= MAX_DECIMAL_PLACES) {
      setDecimalPlaces(parsed);
    }
  };

  const renderHeading = () => (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Ruler className="h-5 w-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-foreground">Measurement settings</h4>
        <p className="text-sm leading-6 text-muted-foreground">
          Link a measurement family, choose allowed units, and control precision for this attribute.
        </p>
      </div>
    </div>
  );

  if (loadState === 'loading') {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6 space-y-4">
        {renderHeading()}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading measurement families...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6 space-y-6">
      {renderHeading()}

      {loadState === 'error' && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-5 py-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-2">
            <p>{errorMessage || 'Unable to load measurement families.'}</p>
            {tenantSlug && (
              <Button size="sm" variant="outline" onClick={fetchMeasurementFamilies}>
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {!measurementFamilies.length && loadState !== 'error' && (
        <div className="rounded-lg border border-border/60 bg-background px-5 py-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No measurement families available</p>
          <p className="mt-1">
            Ask an administrator to configure measurement families for this tenant. Once families exist you can link them here.
          </p>
        </div>
      )}

      {!!measurementFamilies.length && (
        <>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Measurement family</label>
            <Select value={selectedFamily} onValueChange={handleFamilyChange}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select a measurement family..." />
              </SelectTrigger>
              <SelectContent>
                {measurementFamilies.map(family => (
                  <SelectItem key={family.id} value={family.code}>
                    {family.name} ({family.measurement_units.map(unit => unit.symbol).join(', ')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedFamilyData && (
            <div className="space-y-6 rounded-lg border border-border/60 bg-background px-5 py-4">
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{selectedFamilyData.name}</span>
                  {selectedFamilyData.standard_unit && (
                    <span className="text-xs text-muted-foreground">
                      Standard unit: {selectedFamilyData.standard_unit.name} ({selectedFamilyData.standard_unit.symbol})
                    </span>
                  )}
                </div>
                {selectedFamilyData.description && (
                  <p className="text-muted-foreground">{selectedFamilyData.description}</p>
                )}
                {selectedFamilyData.metadata?.conversion_note && (
                  <p className="text-xs text-muted-foreground">
                    {selectedFamilyData.metadata.conversion_note}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Allowed units</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedFamilyData.measurement_units.map(unit => (
                    <label key={unit.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={allowedUnits.includes(unit.code)}
                        onChange={() => toggleAllowedUnit(unit.code)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-foreground">
                        {unit.name} ({unit.symbol})
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Default unit</label>
                  <Select value={defaultUnit} onValueChange={setDefaultUnit}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select a unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedUnits.map(code => {
                        const unit = selectedFamilyData.measurement_units.find(u => u.code === code);
                        if (!unit) {
                          return null;
                        }
                        return (
                          <SelectItem key={unit.id} value={unit.code}>
                            {unit.name} ({unit.symbol})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Decimal precision</label>
                  <Input
                    type="number"
                    min={0}
                    max={MAX_DECIMAL_PLACES}
                    step={1}
                    value={decimalPlaces ?? ''}
                    onChange={handleDecimalPlacesChange}
                    placeholder={(selectedFamilyData.default_decimal_precision ?? 2).toString()}
                    className="h-11"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Controls how many decimal places editors can input (0-{MAX_DECIMAL_PLACES}).
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Allow negative values</p>
                  <p className="text-xs text-muted-foreground">
                    Enable only if negative amounts are meaningful for this measurement.
                  </p>
                </div>
                <Switch checked={allowNegative} onCheckedChange={setAllowNegative} />
              </div>

              {selectedFamilyData.is_composite && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Components</p>
                  <p className="text-xs text-muted-foreground">
                    Choose which dimensions this attribute should capture.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedFamilyData.component_schema.map(component => (
                      <label
                        key={component.key}
                        className="flex items-start gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedComponents.includes(component.key)}
                          onChange={() => toggleComponent(component.key)}
                          className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span>
                          <span className="font-medium text-foreground">{component.label}</span>
                          {component.description && (
                            <p className="text-xs text-muted-foreground">{component.description}</p>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-background px-5 py-4 text-sm text-muted-foreground">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                {selectedFamilyData.is_composite ? (
                  selectedComponents.length > 0 ? (
                    <p className="mt-2">
                      Captures {selectedComponents.map(key => {
                        const component = selectedFamilyData.component_schema.find(item => item.key === key);
                        return component?.label || key;
                      }).join(' x ')} in {defaultUnit || selectedFamilyData.standard_unit?.symbol || 'selected units'}.
                    </p>
                  ) : (
                    <p className="mt-2">Select at least one component to capture.</p>
                  )
                ) : (
                  <p className="mt-2">
                    Captures a single {selectedFamilyData.name.toLowerCase()} value in {defaultUnit || selectedFamilyData.standard_unit?.symbol || 'selected units'}.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
