'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ProductField } from './DynamicFieldRenderer';

interface TableColumnDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'percent' | 'measurement' | 'note' | 'header';
  description?: string;
  precision?: number | null;
  is_required?: boolean;
  is_editable?: boolean;
  measurement_family_code?: string | null;
  default_unit?: string | null;
  units?: Array<{
    code: string;
    label: string;
    symbol?: string | null;
  }>;
}

interface TableSectionDefinition {
  key: string;
  label: string;
  description?: string;
  default_rows?: Array<{
    key: string;
    label: string;
    note?: string;
    parent_row_key?: string;
  }>;
}

interface TableDefinition {
  columns: TableColumnDefinition[];
  sections?: TableSectionDefinition[];
  meta?: {
    allows_custom_rows?: boolean;
    supports_sections?: boolean;
    uses_panel_instances?: boolean;
  };
}

interface InternalTableRow {
  __internal_id: string;
  section?: string | null;
  row_key?: string;
  parent_row_key?: string;
  notes?: string | null;
  [columnKey: string]: any;
}

interface MeasurementCellValue {
  amount: string;
  unit: string;
}

interface TableFieldComponentProps {
  field: ProductField;
  value?: any;
  onChange?: (value: any) => void;
  disabled?: boolean;
  className?: string;
  tenantSlug?: string;
}

type SectionWithRows = {
  key: string | null;
  label: string | null;
  description?: string;
  rows: InternalTableRow[];
};

const createInternalId = () => crypto.randomUUID?.() ?? `row_${Date.now()}_${Math.random()}`;
const PERCENT_COLUMN_KEYS = new Set(['percent_daily_value', 'percent_nrv', 'percent_reference_intake']);
const SERVING_INFO_SECTION_KEY = 'serving_info';
const SERVINGS_PER_CONTAINER_ROW_KEY = 'servings_per_container';

function cloneDefinition(definition: TableDefinition | undefined): TableDefinition {
  if (!definition) {
    return {
      columns: [],
      meta: {}
    };
  }
  return JSON.parse(JSON.stringify(definition));
}

export function TableFieldComponent({
  field,
  value,
  onChange,
  disabled = false,
  className = '',
  tenantSlug
}: TableFieldComponentProps) {
  const definition = useMemo<TableDefinition>(() => {
    const rawDefinition = (field.options as any)?.table_definition;
    return cloneDefinition(rawDefinition);
  }, [field.options]);

  const usesPanelInstances = definition.meta?.uses_panel_instances === true;

  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [measurementFamilies, setMeasurementFamilies] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [panelInstances, setPanelInstances] = useState<any[]>(() =>
    Array.isArray(value) ? value : []
  );

  useEffect(() => {
    if (!usesPanelInstances || !tenantSlug) return;
    let isMounted = true;

    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        const response = await fetch(`/api/${tenantSlug}/product-table-templates`);
        if (!response.ok) {
          throw new Error('Failed to load table templates.');
        }
        const data = await response.json();
        if (isMounted) {
          setTemplates(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.warn('Failed to load table templates', error);
      } finally {
        if (isMounted) {
          setTemplatesLoading(false);
        }
      }
    };

    loadTemplates();

    return () => {
      isMounted = false;
    };
  }, [usesPanelInstances, tenantSlug]);

  useEffect(() => {
    if (!usesPanelInstances || !tenantSlug) return;
    let isMounted = true;

    const loadMeasurementFamilies = async () => {
      try {
        const response = await fetch(`/api/${tenantSlug}/measurement-families`);
        if (!response.ok) {
          throw new Error('Failed to load measurement families.');
        }
        const data = await response.json();
        if (isMounted) {
          setMeasurementFamilies(Array.isArray(data) ? data : data.families ?? []);
        }
      } catch (error) {
        console.warn('Failed to load measurement families', error);
      }
    };

    loadMeasurementFamilies();

    return () => {
      isMounted = false;
    };
  }, [usesPanelInstances, tenantSlug]);

  useEffect(() => {
    if (!usesPanelInstances) return;
    setPanelInstances(Array.isArray(value) ? value : []);
  }, [value, usesPanelInstances]);

  const templateMap = useMemo(() => {
    const map = new Map<string, any>();
    templates.forEach((template) => {
      if (template?.id) {
        map.set(template.id, template);
      }
    });
    return map;
  }, [templates]);

  const supportsSections = definition.meta?.supports_sections ?? (definition.sections?.length ?? 0) > 0;
  const allowsCustomRows = definition.meta?.allows_custom_rows !== false;

  const emitPanelChange = (nextPanels: any[]) => {
    setPanelInstances(nextPanels);
    onChange?.(nextPanels);
  };

  const resolvePanelDefinition = (panel: any): TableDefinition | null => {
    const template =
      (panel?.template_id && templateMap.get(panel.template_id)) ||
      (panel?.template_id && templateMap.get(panel.templateId));
    const rawDefinition = panel?.template_definition || template?.definition;
    if (!rawDefinition) return null;
    const cloned = cloneDefinition(rawDefinition);
    if (cloned.meta) {
      cloned.meta.uses_panel_instances = false;
    }
    if (Array.isArray(cloned.columns) && measurementFamilies.length > 0) {
      const familyMap = new Map<string, any>();
      measurementFamilies.forEach((family) => {
        if (family?.code) {
          familyMap.set(family.code, family);
        }
      });

      cloned.columns = cloned.columns.map((column) => {
        if (
          column.type !== 'measurement' ||
          column.units ||
          !column.measurement_family_code
        ) {
          return column;
        }

        const family = familyMap.get(column.measurement_family_code);
        if (!family || !Array.isArray(family.measurement_units)) {
          return column;
        }

        const units = family.measurement_units.map((unit: any) => ({
          code: unit.code,
          label: unit.name || unit.code,
          symbol: unit.symbol ?? null
        }));

        const defaultUnit =
          family.standard_unit?.code ??
          (Array.isArray(units) && units.length > 0 ? units[0].code : column.default_unit ?? null);

        return {
          ...column,
          units,
          default_unit: defaultUnit
        };
      });
    }
    return cloned;
  };

  const resolvePanelLabel = (panel: any): string => {
    const template =
      (panel?.template_id && templateMap.get(panel.template_id)) ||
      (panel?.template_id && templateMap.get(panel.templateId));
    return panel?.template_label || template?.label || 'Facts Panel';
  };

  const resolvePanelMeta = (panel: any) => {
    const template =
      (panel?.template_id && templateMap.get(panel.template_id)) ||
      (panel?.template_id && templateMap.get(panel.templateId));
    return {
      region: panel?.template_region || template?.region,
      regulator: panel?.template_regulator || template?.regulator,
      locale: panel?.template_locale || template?.locale
    };
  };

  const panelInstancesContent = usesPanelInstances ? (() => {
    const addPanel = (templateId: string) => {
      if (!templateId) return;
      const template = templateMap.get(templateId);
      const nextPanels = [
        ...panelInstances,
        {
          template_id: templateId,
          template_code: template?.code,
          template_label: template?.label,
          template_definition: template?.definition,
          template_region: template?.region,
          template_regulator: template?.regulator,
          template_locale: template?.locale,
          sort_order: panelInstances.length,
          data: { rows: [] }
        }
      ];
      emitPanelChange(nextPanels);
      setSelectedTemplateId('');
    };

    const updatePanel = (index: number, updates: Record<string, any>) => {
      const nextPanels = panelInstances.map((panel, panelIndex) =>
        panelIndex === index ? { ...panel, ...updates } : panel
      );
      emitPanelChange(nextPanels);
    };

    const updatePanelRows = (index: number, rows: any[]) => {
      const current = panelInstances[index] ?? {};
      const nextData = {
        ...(current.data && typeof current.data === 'object' ? current.data : {}),
        rows
      };
      updatePanel(index, { data: nextData });
    };

    const removePanel = (index: number) => {
      const nextPanels = panelInstances.filter((_, panelIndex) => panelIndex !== index);
      emitPanelChange(nextPanels);
    };

    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedTemplateId}
            onValueChange={(value) => {
              setSelectedTemplateId(value);
              addPanel(value);
            }}
            disabled={disabled || templatesLoading}
          >
            <SelectTrigger className="h-10 w-full max-w-xs text-sm">
              <SelectValue placeholder={templatesLoading ? 'Loading templates...' : 'Add panel from template'} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {templates.length} templates available
          </span>
        </div>

        {panelInstances.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
            No facts panels yet. Add a panel template to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {panelInstances.map((panel, index) => {
              const panelDefinition = resolvePanelDefinition(panel);
              const panelLabel = resolvePanelLabel(panel);
              const panelMeta = resolvePanelMeta(panel);
              const panelField: ProductField = {
                id: `${field.id}-panel-${index}`,
                code: `${field.code}_panel_${index}`,
                name: panelLabel,
                field_type: 'table',
                is_required: false,
                is_unique: false,
                options: {
                  table_definition: panelDefinition ?? { columns: [] }
                }
              };

              const panelRows = Array.isArray(panel?.data?.rows)
                ? panel.data.rows
                : Array.isArray(panel?.data)
                ? panel.data
                : [];

              return (
                <div key={panel.template_id ?? index} className="rounded-lg border border-border/60 bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{panelLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        {panelMeta.region ?? '—'} • {panelMeta.regulator ?? '—'} • {panelMeta.locale ?? '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={panel.template_id ?? panel.templateId ?? ''}
                        onValueChange={(value) => {
                          const template = templateMap.get(value);
                          updatePanel(index, {
                            template_id: value,
                            template_code: template?.code,
                            template_label: template?.label,
                            template_definition: template?.definition,
                            template_region: template?.region,
                            template_regulator: template?.regulator,
                            template_locale: template?.locale
                          });
                        }}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-9 w-52 text-xs">
                          <SelectValue placeholder="Template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removePanel(index)}
                        disabled={disabled}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>

                  {panelDefinition ? (
                    <TableFieldComponent
                      field={panelField}
                      value={panelRows}
                      onChange={(rows) => updatePanelRows(index, rows)}
                      disabled={disabled}
                      className="bg-transparent p-0"
                    />
                  ) : (
                    <div className="rounded-md border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
                      Template definition missing. Select a template to continue.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  })() : null;

  const normalizeIncomingRows = (incoming: any): InternalTableRow[] => {
    if (!Array.isArray(incoming)) {
      return [];
    }

    return incoming
      .map((row: any) => {
        if (!row || typeof row !== 'object') return null;
        const internalRow: InternalTableRow = {
          __internal_id: createInternalId(),
          ...row
        };
        return internalRow;
      })
      .filter((row): row is InternalTableRow => row !== null);
  };

  const generateDefaultRows = useCallback((): InternalTableRow[] => {
    if (!definition.sections || definition.sections.length === 0) {
      return [];
    }

    const primaryColumnKey = definition.columns[0]?.key ?? 'label';
    const defaults: InternalTableRow[] = [];

    definition.sections.forEach((section) => {
      section.default_rows?.forEach((row) => {
        defaults.push({
          __internal_id: createInternalId(),
          section: section.key,
          row_key: row.key,
          parent_row_key: row.parent_row_key,
          [primaryColumnKey]: row.label
        });
      });
    });

    return defaults;
  }, [definition.columns, definition.sections]);

  const [rows, setRows] = useState<InternalTableRow[]>(() => {
    const normalized = normalizeIncomingRows(value);
    if (normalized.length > 0) {
      return normalized;
    }
    if (supportsSections) {
      return generateDefaultRows();
    }
    return [];
  });

  const [lastSerializedValue, setLastSerializedValue] = useState<string>(() => {
    try {
      return JSON.stringify(value ?? []);
    } catch {
      return '[]';
    }
  });

  useEffect(() => {
    const serialized = (() => {
      try {
        return JSON.stringify(value ?? []);
      } catch {
        return '[]';
      }
    })();

    if (serialized === lastSerializedValue) {
      return;
    }

    setLastSerializedValue(serialized);
    const normalized = normalizeIncomingRows(value);
    if (normalized.length > 0) {
      setRows(normalized);
    } else if (supportsSections) {
      setRows(generateDefaultRows());
    } else {
      setRows([]);
    }
  }, [value, supportsSections, lastSerializedValue, generateDefaultRows]);

  const emitChange = (nextRows: InternalTableRow[]) => {
    const output = nextRows.map((row) => {
      const { __internal_id, ...rest } = row;
      const cleaned: Record<string, any> = {};

      Object.entries(rest).forEach(([key, cellValue]) => {
        if (cellValue === undefined) return;
        cleaned[key] = cellValue;
      });

      definition.columns.forEach((column) => {
        if (!(column.key in cleaned)) {
          cleaned[column.key] = null;
        } else {
          const currentValue = cleaned[column.key];
          switch (column.type) {
            case 'number':
            case 'percent': {
              if (currentValue === '' || currentValue === null || currentValue === undefined) {
                cleaned[column.key] = null;
              } else {
                const numericValue = Number(currentValue);
                cleaned[column.key] = Number.isNaN(numericValue) ? currentValue : numericValue;
              }
              break;
            }
            case 'measurement': {
              if (currentValue && typeof currentValue === 'object') {
                const normalized: Record<string, any> = {
                  amount: currentValue.amount ?? '',
                  unit:
                    currentValue.unit ??
                    column.default_unit ??
                    column.units?.[0]?.code ??
                    ''
                };
                cleaned[column.key] = normalized;
              } else if (
                currentValue === null ||
                currentValue === undefined ||
                currentValue === ''
              ) {
                cleaned[column.key] = null;
              } else {
                cleaned[column.key] = {
                  amount: currentValue,
                  unit: column.default_unit ?? column.units?.[0]?.code ?? ''
                };
              }
              break;
            }
            default:
              break;
          }
        }
      });

      return cleaned;
    });

    onChange?.(output);
  };

  const handleCellChange = (rowId: string, columnKey: string, newValue: any) => {
    setRows((prev) => {
      const next = prev.map((row) => {
        if (row.__internal_id !== rowId) return row;
        return {
          ...row,
          [columnKey]: newValue
        };
      });
      emitChange(next);
      return next;
    });
  };

  const handleMeasurementChange = (
    rowId: string,
    column: TableColumnDefinition,
    updates: Partial<MeasurementCellValue>
  ) => {
    setRows((prev) => {
      const next = prev.map((row) => {
        if (row.__internal_id !== rowId) return row;
        const currentValue: MeasurementCellValue =
          row[column.key] && typeof row[column.key] === 'object'
            ? { amount: row[column.key].amount ?? '', unit: row[column.key].unit ?? '' }
            : {
                amount: '',
                unit: column.default_unit ?? column.units?.[0]?.code ?? ''
              };

        const merged = {
          ...currentValue,
          ...updates
        };

        return {
          ...row,
          [column.key]: merged
        };
      });

      emitChange(next);
      return next;
    });
  };

  const addRow = (section?: string | null) => {
    if (!allowsCustomRows) return;

    const defaultRow: InternalTableRow = {
      __internal_id: createInternalId(),
      section: section ?? null
    };

    const primaryColumnKey = definition.columns[0]?.key;
    if (primaryColumnKey && !supportsSections) {
      defaultRow[primaryColumnKey] = '';
    }

    const nextRows = [...rows, defaultRow];
    setRows(nextRows);
    emitChange(nextRows);
  };

  const removeRow = (rowId: string) => {
    if (!allowsCustomRows) return;
    const nextRows = rows.filter((row) => row.__internal_id !== rowId);
    setRows(nextRows);
    emitChange(nextRows);
  };

  const sectionsWithRows = useMemo<SectionWithRows[]>(() => {
    if (!supportsSections) {
      return [
        {
          key: null,
          label: null,
          rows
        }
      ];
    }

    const sectionDefinitions = definition.sections ?? [];
    const sectionMap: SectionWithRows[] = sectionDefinitions.map((section) => ({
      key: section.key,
      label: section.label,
      description: section.description,
      rows: rows.filter((row) => (row.section ?? null) === section.key)
    }));

    const unassigned = rows.filter((row) => {
      const rowSection = row.section ?? null;
      return sectionDefinitions.every((section) => section.key !== rowSection);
    });

    if (unassigned.length > 0) {
      sectionMap.push({
        key: null,
        label: 'Additional Rows',
        description: undefined,
        rows: unassigned
      });
    }

    return sectionMap;
  }, [rows, definition.sections, supportsSections]);

  const getSectionColumns = (sectionKey: string | null) => {
    if (!sectionKey || sectionKey !== SERVING_INFO_SECTION_KEY) {
      return definition.columns;
    }
    return definition.columns.filter((column) => !PERCENT_COLUMN_KEYS.has(column.key));
  };

  if (usesPanelInstances) {
    return panelInstancesContent;
  }

  if (!definition.columns || definition.columns.length === 0) {
    return (
      <div className={cn('rounded-md border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground', className)}>
        Table definition is missing. Update the field configuration to add columns.
      </div>
    );
  }

  const renderCellInput = (row: InternalTableRow, column: TableColumnDefinition) => {
    const cellValue = row[column.key];
    const isIndented =
      column.key === definition.columns[0]?.key &&
      typeof row.parent_row_key === 'string' &&
      row.parent_row_key.length > 0;
    const inputClassName = isIndented ? 'pl-6' : undefined;

    switch (column.type) {
      case 'number':
      case 'percent': {
        const valueAsString =
          cellValue === null || cellValue === undefined ? '' : String(cellValue);
        const step =
          typeof column.precision === 'number'
            ? Number((1 / Math.pow(10, column.precision)).toFixed(column.precision))
            : 'any';

        return (
          <Input
            type="number"
            value={valueAsString}
            onChange={(event) => handleCellChange(row.__internal_id, column.key, event.target.value)}
            step={step}
            disabled={disabled || column.is_editable === false}
            className={inputClassName}
          />
        );
      }
      case 'measurement': {
        const measurementValue: MeasurementCellValue =
          cellValue && typeof cellValue === 'object'
            ? {
                amount: cellValue.amount ?? '',
                unit:
                  cellValue.unit ??
                  column.default_unit ??
                  column.units?.[0]?.code ??
                  ''
              }
            : {
                amount: cellValue ?? '',
                unit: column.default_unit ?? column.units?.[0]?.code ?? ''
              };

        const hideUnitSelect =
          row.section === SERVING_INFO_SECTION_KEY &&
          row.row_key === SERVINGS_PER_CONTAINER_ROW_KEY;

        return (
          <div className="flex gap-2">
            <Input
              type="number"
              value={measurementValue.amount}
              onChange={(event) =>
                handleMeasurementChange(row.__internal_id, column, { amount: event.target.value })
              }
              step={
                typeof column.precision === 'number'
                  ? Number((1 / Math.pow(10, column.precision)).toFixed(column.precision))
                  : 'any'
              }
              disabled={disabled || column.is_editable === false}
              className={inputClassName}
            />
            {!hideUnitSelect && (
              <Select
                value={measurementValue.unit}
                onValueChange={(value) =>
                  handleMeasurementChange(row.__internal_id, column, { unit: value })
                }
                disabled={disabled || column.is_editable === false}
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
            )}
          </div>
        );
      }
      case 'note':
      case 'header':
      case 'text':
      default: {
        const valueAsString =
          cellValue === null || cellValue === undefined ? '' : String(cellValue);
        return (
          <Input
            value={valueAsString}
            onChange={(event) => handleCellChange(row.__internal_id, column.key, event.target.value)}
            disabled={disabled || column.is_editable === false}
            className={inputClassName}
          />
        );
      }
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {sectionsWithRows.map((section) => (
        <div key={section.key ?? 'default'} className="space-y-3">
          {supportsSections && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {section.label ?? 'Additional Rows'}
                  </h4>
                  {section.description && (
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  )}
                </div>
                {allowsCustomRows && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRow(section.key)}
                    disabled={disabled}
                  >
                    Add Row
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            {(() => {
              const sectionColumns = getSectionColumns(section.key);
              return (
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {sectionColumns.map((column) => (
                    <th
                      key={column.key}
                      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {column.label}
                    </th>
                  ))}
                  {allowsCustomRows && <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {section.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={sectionColumns.length + (allowsCustomRows ? 1 : 0)}
                      className="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      {supportsSections
                        ? 'No rows in this section yet.'
                        : 'No rows added yet.'}
                    </td>
                  </tr>
                ) : (
                  section.rows.map((row) => (
                    <tr key={row.__internal_id} className="bg-background/60">
                      {sectionColumns.map((column) => (
                        <td key={column.key} className="px-3 py-2 align-top">
                          {renderCellInput(row, column)}
                        </td>
                      ))}
                      {allowsCustomRows && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeRow(row.__internal_id)}
                            disabled={disabled}
                          >
                            Remove
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
              );
            })()}
          </div>

          {!supportsSections && allowsCustomRows && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRow(null)}
              disabled={disabled}
            >
              Add Row
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
