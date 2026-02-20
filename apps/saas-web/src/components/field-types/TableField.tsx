'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ProductTableDefinition,
  ProductTableColumn,
  ProductTableMeta,
  ProductTableUnitOption
} from '@tradetool/types';

interface MeasurementFamily {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_composite?: boolean;
  component_schema?: Array<{ key: string; label: string }>;
  standard_unit?: {
    value: string;
    label: string;
    symbol?: string;
  } | null;
  measurement_units: Array<{
    code: string;
    name: string;
    symbol?: string;
    conversion_factor?: number;
  }>;
}

export interface TableFieldOptions {
  table_definition?: ProductTableDefinition;
  [key: string]: any;
}

interface TableFieldProps {
  tenantSlug: string;
  value?: TableFieldOptions;
  onChange?: (value: TableFieldOptions) => void;
}

const DEFAULT_DEFINITION: ProductTableDefinition = {
  columns: [
    {
      key: 'value',
      label: 'Value',
      type: 'text',
      is_editable: true,
      is_required: false
    }
  ],
  meta: {
    allows_custom_rows: true,
    supports_sections: false
  }
};

const COLUMN_TYPE_OPTIONS: Array<{ value: ProductTableColumn['type']; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'percent', label: 'Percent' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'note', label: 'Note' },
  { value: 'header', label: 'Header' }
];

function cloneDefinition(definition: ProductTableDefinition | undefined): ProductTableDefinition {
  if (!definition) {
    return JSON.parse(JSON.stringify(DEFAULT_DEFINITION));
  }
  return JSON.parse(JSON.stringify(definition));
}

function slugifyKey(value: string, fallback: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60);
  if (base.length > 0) {
    return base;
  }
  const cleanedFallback = fallback
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60);
  return cleanedFallback.length > 0 ? cleanedFallback : `column_${Date.now()}`;
}

export function TableField({
  tenantSlug,
  value,
  onChange
}: TableFieldProps) {
  const [definition, setDefinition] = useState<ProductTableDefinition>(() =>
    cloneDefinition(value?.table_definition)
  );
  const [measurementFamilies, setMeasurementFamilies] = useState<MeasurementFamily[]>([]);
  const [measurementError, setMeasurementError] = useState<string | null>(null);

  useEffect(() => {
    if (value?.table_definition) {
      setDefinition(cloneDefinition(value.table_definition));
    }
  }, [value?.table_definition]);

  useEffect(() => {
    if (!tenantSlug) return;

    const loadMeasurementFamilies = async () => {
      try {
        setMeasurementError(null);
        const response = await fetch(`/api/${tenantSlug}/measurement-families`);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || 'Unable to load measurement families.');
        }
        const payload = await response.json().catch(() => null);
        const families: MeasurementFamily[] = Array.isArray(payload) ? payload : [];
        setMeasurementFamilies(families);
      } catch (error) {
        console.error('Error fetching measurement families:', error);
        setMeasurementError(
          error instanceof Error ? error.message : 'Unable to load measurement families.'
        );
      } finally {
        // no-op
      }
    };

    loadMeasurementFamilies();
  }, [tenantSlug]);

  const emitChange = useCallback(
    (nextDefinition: ProductTableDefinition) => {
      const payload: TableFieldOptions = {
        ...(value && typeof value === 'object' ? value : {}),
        table_definition: cloneDefinition(nextDefinition)
      };

      delete (payload as any).template_reference;

      onChange?.(payload);
    },
    [onChange, value]
  );

  const applyDefinitionUpdate = useCallback(
    (
      updater: (prev: ProductTableDefinition) => ProductTableDefinition | null,
      options: { emit?: boolean } = {}
    ) => {
      const { emit = true } = options;
      let nextDefinition: ProductTableDefinition | null = null;
      setDefinition((prev) => {
        nextDefinition = updater(prev);
        return nextDefinition ?? prev;
      });
      if (nextDefinition && emit) {
        emitChange(nextDefinition);
      }
    },
    [emitChange]
  );

  useEffect(() => {
    if (!measurementFamilies.length) {
      return;
    }

    applyDefinitionUpdate((prev) => {
      if (!prev || !Array.isArray(prev.columns) || prev.columns.length === 0) {
        return null;
      }

      let changed = false;
      const nextColumns = prev.columns.map((column) => {
        if (column.type !== 'measurement') {
          return column;
        }

        const hasUnits = Array.isArray(column.units) && column.units.length > 0;
        const family = measurementFamilies.find(
          (item) => item.code === column.measurement_family_code
        );

        if (!family) {
          return column;
        }

        const availableUnits = Array.isArray(family.measurement_units)
          ? family.measurement_units
          : [];

        const units: ProductTableUnitOption[] = availableUnits.map((unit) => ({
          code: unit.code,
          label: unit.name,
          symbol: unit.symbol ?? null,
          conversion_factor: unit.conversion_factor ?? null
        }));

        const defaultUnit =
          column.default_unit ?? family.standard_unit?.value ?? units[0]?.code ?? null;

        if (!hasUnits || column.default_unit !== defaultUnit) {
          changed = true;
          return {
            ...column,
            units,
            default_unit: defaultUnit ?? undefined
          };
        }

        return column;
      });

      if (!changed) {
        return null;
      }

      return {
        ...prev,
        columns: nextColumns
      };
    });
  }, [measurementFamilies, applyDefinitionUpdate]);

  const handleMetaChange = (updates: Partial<ProductTableMeta>, options: { emit?: boolean } = {}) => {
    applyDefinitionUpdate(
      (prev) => {
        const nextMeta: ProductTableMeta = {
          ...(prev.meta || {}),
          ...updates
        };
        return {
          ...prev,
          meta: nextMeta
        };
      },
      options
    );
  };

  const handleColumnUpdate = (
    index: number,
    updates: Partial<ProductTableColumn>,
    options: { emit?: boolean; syncKey?: boolean } = {}
  ) => {
    const { emit = true, syncKey = true } = options;

    applyDefinitionUpdate(
      (prev) => {
        const columns = [...prev.columns];
        const currentColumn = columns[index];
        if (!currentColumn) {
          return null;
        }

        const metadata = { ...(currentColumn.metadata || {}) };
        let nextColumn: ProductTableColumn = {
          ...currentColumn,
          ...updates
        };

        if (updates.key !== undefined && updates.key !== currentColumn.key) {
          metadata.custom_key = true;
        }

        const shouldSyncKey =
          syncKey &&
          updates.label !== undefined &&
          metadata.custom_key !== true;

        if (shouldSyncKey) {
          const fallback = currentColumn.key || `column_${index + 1}`;
          nextColumn.key = slugifyKey(updates.label ?? '', fallback);
        }

        if (Object.keys(metadata).length > 0) {
          nextColumn = {
            ...nextColumn,
            metadata
          };
        }

        columns[index] = nextColumn;

        return {
          ...prev,
          columns
        };
      },
      { emit }
    );
  };

  const handleColumnTypeChange = (index: number, nextType: ProductTableColumn['type']) => {
    handleColumnUpdate(index, { type: nextType });

    if (nextType === 'measurement' && measurementFamilies.length > 0) {
      const family = measurementFamilies[0];
      handleMeasurementFamilyChange(index, family.code);
    } else if (nextType !== 'measurement') {
      applyDefinitionUpdate((prev) => {
        const columns = [...prev.columns];
        const current = columns[index];
        if (!current) {
          return null;
        }

        const nextColumn: ProductTableColumn = {
          ...current
        };

        delete nextColumn.measurement_family_code;
        delete nextColumn.default_unit;
        delete nextColumn.units;

        columns[index] = nextColumn;

        return {
          ...prev,
          columns
        };
      });
    }
  };

  const handleMeasurementFamilyChange = (index: number, familyCode: string) => {
    const family = measurementFamilies.find((item) => item.code === familyCode);
    if (!family) return;

    const unitsSource = Array.isArray(family.measurement_units) ? family.measurement_units : [];
    const units: ProductTableUnitOption[] = unitsSource.map((unit) => ({
      code: unit.code,
      label: unit.name,
      symbol: unit.symbol,
      conversion_factor: unit.conversion_factor ?? null
    }));

    applyDefinitionUpdate((prev) => {
      const columns = [...prev.columns];
      const current = columns[index];
      const nextColumn: ProductTableColumn = {
        ...current,
        measurement_family_code: family.code,
        units,
        default_unit: family.standard_unit?.value ?? units[0]?.code ?? null
      };
      columns[index] = nextColumn;
      return {
        ...prev,
        columns
      };
    });
  };

  const addColumn = () => {
    applyDefinitionUpdate((prev) => {
      const nextColumns: ProductTableColumn[] = [
        ...prev.columns,
        {
          key: slugifyKey(`column_${prev.columns.length + 1}`, `column_${prev.columns.length + 1}`),
          label: `Column ${prev.columns.length + 1}`,
          type: 'text',
          is_editable: true,
          is_required: false
        }
      ];
      return {
        ...prev,
        columns: nextColumns
      };
    });
  };

  const removeColumn = (index: number) => {
    applyDefinitionUpdate((prev) => {
      if (prev.columns.length <= 1) {
        return null;
      }
      const nextColumns = prev.columns.filter((_, idx) => idx !== index);
      return {
        ...prev,
        columns: nextColumns
      };
    });
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    applyDefinitionUpdate((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.columns.length) {
        return null;
      }
      const nextColumns = [...prev.columns];
      const [removed] = nextColumns.splice(index, 1);
      nextColumns.splice(targetIndex, 0, removed);
      return {
        ...prev,
        columns: nextColumns
      };
    });
  };

  const renderColumnsEditor = () => {
    return (
      <div className="space-y-4">
        {definition.columns.map((column, index) => (
          <div
            key={column.key || index}
            className="rounded-lg border border-border/60 bg-background/80 p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">
                  Column {index + 1}
                </span>
                {column.type === 'measurement' && (
                  <Badge variant="outline" className="text-xs">
                    Measurement
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => moveColumn(index, 'up')}
                  disabled={index === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => moveColumn(index, 'down')}
                  disabled={index === definition.columns.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeColumn(index)}
                  disabled={definition.columns.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Label</label>
                <Input
                  value={column.label ?? ''}
                  onChange={(event) =>
                    handleColumnUpdate(
                      index,
                      { label: event.target.value },
                      { emit: false, syncKey: false }
                    )
                  }
                  onBlur={(event) =>
                    handleColumnUpdate(
                      index,
                      { label: event.target.value },
                      { emit: true }
                    )
                  }
                  placeholder="e.g., Amount Per Serving"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>System key:</span>
                  <code className="rounded bg-muted px-1.5 py-0.5">{column.key}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(column.key ?? '').catch(() => undefined);
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input
                  value={column.description ?? ''}
                  onChange={(event) =>
                    handleColumnUpdate(
                      index,
                      { description: event.target.value || undefined },
                      { emit: false }
                    )
                  }
                  onBlur={(event) =>
                    handleColumnUpdate(index, { description: event.target.value || undefined })
                  }
                  placeholder="Optional helper text"
                />
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select
                  value={column.type}
                  onValueChange={(value) =>
                    handleColumnTypeChange(index, value as ProductTableColumn['type'])
                  }
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {column.type === 'measurement' && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Measurement Family
                  </label>
                  <Select
                    value={column.measurement_family_code ?? ''}
                    onValueChange={(value) => handleMeasurementFamilyChange(index, value)}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {measurementFamilies.map((family) => (
                        <SelectItem key={family.id} value={family.code}>
                          {family.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {measurementError && (
                    <p className="text-xs text-destructive">{measurementError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Default Unit</label>
                  <Select
                    value={column.default_unit ?? ''}
                    onValueChange={(value) =>
                      handleColumnUpdate(index, { default_unit: value })
                    }
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(column.units ?? []).map((unit) => (
                        <SelectItem key={unit.code} value={unit.code}>
                          {unit.label} {unit.symbol ? `(${unit.symbol})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Decimal Precision
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={6}
                    value={column.precision ?? ''}
                    onChange={(event) =>
                      handleColumnUpdate(
                        index,
                        {
                          precision:
                            event.target.value === ''
                              ? null
                              : Math.max(0, Math.min(6, Number(event.target.value)))
                        },
                        { emit: false }
                      )
                    }
                    onBlur={(event) =>
                      handleColumnUpdate(index, {
                        precision:
                          event.target.value === ''
                            ? null
                            : Math.max(0, Math.min(6, Number(event.target.value)))
                      })
                    }
                    placeholder="e.g., 2"
                  />
                </div>
              </div>
            )}

            {column.type !== 'measurement' && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Decimal Precision
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={6}
                    value={column.precision ?? ''}
                    onChange={(event) =>
                      handleColumnUpdate(
                        index,
                        {
                          precision:
                            event.target.value === ''
                              ? null
                              : Math.max(0, Math.min(6, Number(event.target.value)))
                        },
                        { emit: false }
                      )
                    }
                    onBlur={(event) =>
                      handleColumnUpdate(index, {
                        precision:
                          event.target.value === ''
                            ? null
                            : Math.max(0, Math.min(6, Number(event.target.value)))
                      })
                    }
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Required Column
                  </label>
                  <div className="flex h-10 items-center rounded-md border border-border px-3">
                    <Switch
                      checked={!!column.is_required}
                      onCheckedChange={(checked) =>
                        handleColumnUpdate(index, { is_required: checked })
                      }
                    />
                    <span className="ml-3 text-sm text-muted-foreground">
                      Require a value for this column
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              <Switch
                checked={column.is_editable !== false}
                onCheckedChange={(checked) => handleColumnUpdate(index, { is_editable: checked })}
              />
              <span className="text-sm text-muted-foreground">
                Allow product editors to update this column
              </span>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={addColumn} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add Column
        </Button>
      </div>
    );
  };

  const renderMetaSettings = () => {
    return (
      <div className="rounded-lg border border-border/60 bg-background/80 p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-foreground">Table Settings</h4>
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-3">
            <Switch
              checked={definition.meta?.allows_custom_rows !== false}
              onCheckedChange={(checked) =>
                handleMetaChange({ allows_custom_rows: checked })
              }
            />
            <div>
              <p className="text-sm font-medium text-foreground">Allow custom rows</p>
              <p className="text-xs text-muted-foreground">
                When enabled, editors can add, remove, and reorder rows in the product detail view.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Switch
              checked={definition.meta?.supports_sections ?? (definition.sections?.length ?? 0) > 0}
              onCheckedChange={(checked) =>
                handleMetaChange({ supports_sections: checked })
              }
            />
            <div>
              <p className="text-sm font-medium text-foreground">Enable sections</p>
              <p className="text-xs text-muted-foreground">
                Sections group rows (e.g., Serving Info, Macronutrients).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Define a structured table with custom columns tailored to your product data.
        </p>
      </div>

      {renderColumnsEditor()}

      {renderMetaSettings()}

    </div>
  );
}
