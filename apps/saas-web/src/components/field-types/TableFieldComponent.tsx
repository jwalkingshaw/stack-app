'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CornerDownRight, Download, GripVertical } from 'lucide-react';
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
  is_group_header?: boolean;
  notes?: string | null;
  [columnKey: string]: unknown;
}

interface MeasurementCellValue {
  amount: string;
  unit: string;
}

interface TableFieldComponentProps {
  field: ProductField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
  className?: string;
  tenantSlug?: string;
  productName?: string;
  ingredients?: string;
  otherIngredients?: string;
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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const getPanelTemplateId = (panel: Record<string, unknown>): string | null => {
  const raw = panel.template_id ?? panel.templateId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
};

const parseJsonSafely = async (response: Response): Promise<unknown | null> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

function cloneDefinition(definition: TableDefinition | undefined): TableDefinition {
  if (!definition) {
    return {
      columns: [],
      meta: {}
    };
  }
  return JSON.parse(JSON.stringify(definition));
}

// ─── Facts panel print / PDF helpers ────────────────────────────────────────

function formatPrintMeasurement(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value !== null && value !== undefined ? String(value) : '';
  }
  const v = value as Record<string, unknown>;
  const amount = String(v.amount ?? '').trim();
  const unit = String(v.unit ?? '').trim();
  if (!amount) return '';
  return unit ? `${amount}${unit}` : amount;
}

function formatPrintCell(value: unknown, type: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'measurement') return formatPrintMeasurement(value) || '—';
  if (type === 'percent') {
    if (typeof value === 'number') return `${value}%`;
    const n = Number(value);
    return Number.isNaN(n) ? '*' : `${n}%`;
  }
  return String(value);
}

function buildFactsPanelPrintHtml(
  productName: string,
  panelLabel: string,
  panelMeta: { region?: unknown; regulator?: unknown; locale?: unknown },
  definition: TableDefinition,
  rows: unknown[],
  ingredients?: string,
  otherIngredients?: string
): string {
  const columns = definition.columns ?? [];
  const sections = definition.sections ?? [];
  const nutrientKey = columns[0]?.key ?? 'nutrient';
  const SERVING_KEY = 'serving_info';
  const PERCENT_KEYS = new Set(['percent_daily_value', 'percent_nrv', 'percent_reference_intake']);

  const typedRows = rows as Array<Record<string, unknown>>;
  const servingRows = typedRows.filter((r) => (r.section ?? null) === SERVING_KEY);
  const contentRows = typedRows.filter((r) => (r.section ?? null) !== SERVING_KEY);

  // Serving info — displayed as header key/value pairs
  const servingInfoHtml = servingRows
    .map((row) => {
      const name = String(row[nutrientKey] ?? '');
      const valueCol = columns.find((c) => c.type === 'measurement' || c.type === 'number');
      const val = valueCol ? formatPrintCell(row[valueCol.key], valueCol.type) : '';
      return `<div class="si-row"><span class="si-name">${name}</span><span class="si-val">${val}</span></div>`;
    })
    .join('');

  // Table columns (everything after the nutrient name column)
  const valueCols = columns.slice(1);

  // Column headers row
  const headerRow = `<tr class="col-head">
    <th class="th-nutrient"></th>
    ${valueCols.map((c) => `<th class="th-val">${c.label}</th>`).join('')}
  </tr>`;

  // Section tables
  const sectionMap = new Map<string, typeof contentRows>();
  contentRows.forEach((row) => {
    const sec = String(row.section ?? '__none__');
    if (!sectionMap.has(sec)) sectionMap.set(sec, []);
    sectionMap.get(sec)!.push(row);
  });

  const sectionsHtml = sections
    .filter((s) => s.key !== SERVING_KEY)
    .map((section) => {
      const sectionRows = sectionMap.get(section.key) ?? [];
      if (sectionRows.length === 0) return '';

      const rowsHtml = sectionRows
        .map((row) => {
          const name = String(row[nutrientKey] ?? '');
          const isChild = typeof row.parent_row_key === 'string' && row.parent_row_key.length > 0;
          const valueTds = valueCols
            .map((col) => {
              // Hide % columns for serving_info — but these rows are content rows, so always show
              const val = PERCENT_KEYS.has(col.key) && (row.section === SERVING_KEY)
                ? ''
                : formatPrintCell(row[col.key], col.type);
              return `<td class="td-val">${val}</td>`;
            })
            .join('');
          return `<tr><td class="td-nutrient${isChild ? ' child' : ''}">${name}</td>${valueTds}</tr>`;
        })
        .join('');

      return `<tbody>
        <tr class="section-head"><td colspan="${valueCols.length + 1}">${section.label}</td></tr>
        ${rowsHtml}
      </tbody>`;
    })
    .join('');

  const metaLine = [panelMeta.region, panelMeta.regulator]
    .filter(Boolean)
    .map(String)
    .join(' · ');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${productName ? `${productName} — ` : ''}${panelLabel}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000;
         padding: 32px; max-width: 420px; }
  .product-label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
                   color: #888; margin-bottom: 4px; }
  .product-name  { font-size: 22px; font-weight: 700; margin-bottom: 20px; line-height: 1.2; }
  .panel { border: 2px solid #000; }
  .panel-header  { padding: 6px 10px 8px; border-bottom: 8px solid #000; }
  .panel-title   { font-size: 28px; font-weight: 900; line-height: 1.1; }
  .panel-meta    { font-size: 9px; color: #555; margin-top: 3px; }
  .serving-info  { padding: 6px 10px; border-bottom: 4px solid #000; font-size: 12px; }
  .si-row  { display: flex; justify-content: space-between; gap: 12px; line-height: 1.5; }
  .si-name { font-weight: 600; }
  table  { width: 100%; border-collapse: collapse; font-size: 11px; }
  .col-head th   { padding: 4px 8px; font-size: 9px; text-transform: uppercase;
                   letter-spacing: .05em; border-bottom: 1px solid #000; text-align: right; }
  .col-head .th-nutrient { text-align: left; }
  .section-head td { padding: 4px 8px; font-weight: 700; font-size: 10px; text-transform: uppercase;
                     letter-spacing: .04em; border-top: 2px solid #000; background: #f2f2f2; }
  tbody tr + tr td { border-top: .5px solid #ddd; }
  .td-nutrient  { padding: 3px 8px; font-weight: 600; font-size: 11px; }
  .td-nutrient.child { font-weight: 400; padding-left: 20px; }
  .td-val { padding: 3px 8px; text-align: right; white-space: nowrap; }
  .ingredients-section { margin-top: 16px; font-size: 11px; line-height: 1.5; }
  .ingredients-section h3 { font-size: 10px; font-weight: 700; text-transform: uppercase;
                             letter-spacing: .05em; border-bottom: 1px solid #000;
                             padding-bottom: 3px; margin-bottom: 6px; }
  .ingredients-section p { margin: 0; white-space: pre-wrap; word-break: break-word; }
  @media print {
    body { padding: 0; }
    @page { margin: 12mm; size: A4 portrait; }
  }
</style>
</head>
<body>
  ${productName ? `<div class="product-label">Product</div><div class="product-name">${productName}</div>` : ''}
  <div class="panel">
    <div class="panel-header">
      <div class="panel-title">${panelLabel}</div>
      ${metaLine ? `<div class="panel-meta">${metaLine}</div>` : ''}
    </div>
    ${servingRows.length > 0 ? `<div class="serving-info">${servingInfoHtml}</div>` : ''}
    <table>
      <thead>${headerRow}</thead>
      ${sectionsHtml || '<tbody></tbody>'}
    </table>
  </div>
  ${ingredients ? `
  <div class="ingredients-section">
    <h3>Ingredients</h3>
    <p>${ingredients.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  </div>` : ''}
  ${otherIngredients ? `
  <div class="ingredients-section">
    <h3>Other Ingredients</h3>
    <p>${otherIngredients.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  </div>` : ''}
  <script>window.addEventListener('load', function() { window.print(); });</script>
</body>
</html>`;
}

function openPanelPrintWindow(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Revoke after enough time for the page to load and the print dialog to open
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  if (!win) {
    // Fallback if popup was blocked — navigate current tab (unlikely in practice)
    window.location.href = url;
  }
}

function reorderWithChildren(
  allRows: InternalTableRow[],
  draggedId: string,
  targetId: string
): InternalTableRow[] {
  const dragged = allRows.find((r) => r.__internal_id === draggedId);
  if (!dragged) return allRows;

  // Collect the dragged row and any direct children
  const draggedKey = typeof dragged.row_key === 'string' ? dragged.row_key : null;
  const group = [dragged, ...allRows.filter((r) => draggedKey && r.parent_row_key === draggedKey)];
  const groupIds = new Set(group.map((r) => r.__internal_id));
  const rest = allRows.filter((r) => !groupIds.has(r.__internal_id));

  let insertAt = rest.findIndex((r) => r.__internal_id === targetId);
  if (insertAt === -1) return allRows;

  // Skip past any children of the target so we land after the whole group
  const targetKey = typeof rest[insertAt]?.row_key === 'string' ? rest[insertAt].row_key : null;
  if (targetKey) {
    for (let i = insertAt + 1; i < rest.length; i++) {
      if (rest[i].parent_row_key === targetKey) insertAt = i;
      else break;
    }
  }

  rest.splice(insertAt + 1, 0, ...group);
  return rest;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TableFieldComponent({
  field,
  value,
  onChange,
  disabled = false,
  className = '',
  tenantSlug,
  productName,
  ingredients,
  otherIngredients,
}: TableFieldComponentProps) {
  const definition = useMemo<TableDefinition>(() => {
    const rawDefinition = (field.options as Record<string, unknown>)?.table_definition;
    return cloneDefinition(rawDefinition as TableDefinition | undefined);
  }, [field.options]);

  const usesPanelInstances = definition.meta?.uses_panel_instances === true;

  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [measurementFamilies, setMeasurementFamilies] = useState<Array<Record<string, unknown>>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [panelInstances, setPanelInstances] = useState<Array<Record<string, unknown>>>(() =>
    Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
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
        const data = await parseJsonSafely(response);
        if (!data) {
          throw new Error('Table templates API returned an empty or invalid response.');
        }
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
        const data = await parseJsonSafely(response);
        if (!data) {
          throw new Error('Measurement families API returned an empty or invalid response.');
        }
        if (isMounted) {
          setMeasurementFamilies(
            Array.isArray(data)
              ? (data as Array<Record<string, unknown>>)
              : isRecord(data) && Array.isArray(data.families)
              ? (data.families as Array<Record<string, unknown>>)
              : []
          );
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
    setPanelInstances(Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []);
  }, [value, usesPanelInstances]);

  const templateMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    templates.forEach((template) => {
      if (template?.id) {
        map.set(String(template.id), template);
      }
    });
    return map;
  }, [templates]);

  const supportsSections = definition.meta?.supports_sections ?? (definition.sections?.length ?? 0) > 0;
  const allowsCustomRows = definition.meta?.allows_custom_rows !== false;

  const emitPanelChange = (nextPanels: Array<Record<string, unknown>>) => {
    setPanelInstances(nextPanels);
    onChange?.(nextPanels);
  };

  const resolvePanelDefinition = (panel: Record<string, unknown>): TableDefinition | null => {
    const templateId = getPanelTemplateId(panel);
    const template = templateId ? templateMap.get(templateId) : undefined;
    const templateDefinition = template?.definition;
    const rawDefinition = panel.template_definition || templateDefinition;
    if (!rawDefinition) return null;
    const cloned = cloneDefinition(rawDefinition as TableDefinition);
    if (cloned.meta) {
      cloned.meta.uses_panel_instances = false;
    }
    if (Array.isArray(cloned.columns) && measurementFamilies.length > 0) {
      const familyMap = new Map<string, Record<string, unknown>>();
      measurementFamilies.forEach((family) => {
        const familyCode = typeof family.code === 'string' ? family.code : '';
        if (familyCode) {
          familyMap.set(familyCode, family);
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
        const measurementUnits = family?.measurement_units;
        if (!family || !Array.isArray(measurementUnits)) {
          return column;
        }

        const units = (measurementUnits as Array<Record<string, unknown>>).map((unit) => ({
          code: String(unit.code || ''),
          label: String(unit.name || unit.code || ''),
          symbol: typeof unit.symbol === 'string' ? unit.symbol : null
        }));

        const defaultUnit =
          column.default_unit ??
          ((family.standard_unit as Record<string, unknown> | null)?.code as string | undefined) ??
          (Array.isArray(units) && units.length > 0 ? units[0].code : null);

        return {
          ...column,
          units,
          default_unit: defaultUnit
        };
      });
    }
    return cloned;
  };

  const resolvePanelLabel = (panel: Record<string, unknown>): string => {
    const templateId = getPanelTemplateId(panel);
    const template = templateId ? templateMap.get(templateId) : undefined;
    return String(panel.template_label || template?.label || 'Facts Panel');
  };

  const resolvePanelMeta = (panel: Record<string, unknown>) => {
    const templateId = getPanelTemplateId(panel);
    const template = templateId ? templateMap.get(templateId) : undefined;
    return {
      region: panel.template_region || template?.region,
      regulator: panel.template_regulator || template?.regulator,
      locale: panel.template_locale || template?.locale
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

    const updatePanel = (index: number, updates: Record<string, unknown>) => {
      const nextPanels = panelInstances.map((panel, panelIndex) =>
        panelIndex === index ? { ...panel, ...updates } : panel
      );
      emitPanelChange(nextPanels);
    };

    const updatePanelRows = (index: number, rows: unknown[]) => {
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
              {templates.map((template, templateIndex) => {
                const templateId = typeof template.id === 'string' ? template.id : `template-${templateIndex}`;
                const templateLabel =
                  typeof template.label === 'string' ? template.label : templateId;
                return (
                  <SelectItem key={templateId} value={templateId}>
                    {templateLabel}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
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
              const panelTemplateId = getPanelTemplateId(panel);
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

              const panelData = isRecord(panel.data) ? panel.data : null;
              const panelRows = Array.isArray(panelData?.rows)
                ? (panelData.rows as unknown[])
                : Array.isArray(panel.data)
                ? (panel.data as unknown[])
                : [];

              return (
                <div key={index} className="rounded-lg border border-border/60 bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{panelLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        {String(panelMeta.region ?? "-")} • {String(panelMeta.regulator ?? "-")} • {String(panelMeta.locale ?? "-")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        title="Download panel as PDF"
                        onClick={() => {
                          if (!panelDefinition) return;
                          const html = buildFactsPanelPrintHtml(
                            productName ?? '',
                            panelLabel,
                            panelMeta,
                            panelDefinition,
                            panelRows,
                            ingredients,
                            otherIngredients
                          );
                          openPanelPrintWindow(html);
                        }}
                        disabled={disabled || !panelDefinition}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
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
                      onChange={(rows) => updatePanelRows(index, Array.isArray(rows) ? rows : [])}
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

  const normalizeIncomingRows = (incoming: unknown): InternalTableRow[] => {
    if (!Array.isArray(incoming)) {
      return [];
    }

    return incoming
      .map((row: unknown) => {
        if (!row || typeof row !== 'object') return null;
        const internalRow: InternalTableRow = {
          __internal_id: createInternalId(),
          ...(row as Record<string, unknown>)
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

    definition.sections.filter(Boolean).forEach((section) => {
      section.default_rows?.forEach((row) => {
        if (!row) return;
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

  const emitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitChange = (nextRows: InternalTableRow[]) => {
    const output = nextRows.map((row) => {
      const { __internal_id, ...rest } = row;
      void __internal_id;
      const cleaned: Record<string, unknown> = {};

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
              if (isRecord(currentValue)) {
                const normalized: Record<string, unknown> = {
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

    // Debounce so rapid keystrokes don't trigger a save on every character.
    // Pre-set lastSerializedValue so that when the parent round-trips the value
    // back down as a prop, the useEffect skips the reset and focus is preserved.
    if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
    emitTimerRef.current = setTimeout(() => {
      try {
        setLastSerializedValue(JSON.stringify(output));
      } catch {
        // ignore
      }
      onChange?.(output);
    }, 400);
  };

  const handleCellChange = (rowId: string, columnKey: string, newValue: unknown) => {
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
        const rawCell = row[column.key];
        const currentValue: MeasurementCellValue =
          isRecord(rawCell)
            ? {
                amount: String(rawCell.amount ?? ''),
                unit: String(rawCell.unit ?? '')
              }
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

  const toggleGroupHeader = (rowId: string) => {
    if (!allowsCustomRows) return;
    const nextRows = rows.map((row) =>
      row.__internal_id === rowId ? { ...row, is_group_header: !row.is_group_header } : row
    );
    setRows(nextRows);
    emitChange(nextRows);
  };

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  const draggingIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, rowId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    draggingIdRef.current = rowId;
    // Give the browser one frame to paint the ghost before dimming
    requestAnimationFrame(() => setDragOverId(null));
  };

  const handleDragOver = (e: React.DragEvent, rowId: string) => {
    e.preventDefault();
    if (draggingIdRef.current && draggingIdRef.current !== rowId && dragOverId !== rowId) {
      setDragOverId(rowId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetRowId: string) => {
    e.preventDefault();
    const draggedId = draggingIdRef.current;
    draggingIdRef.current = null;
    setDragOverId(null);
    if (!draggedId || draggedId === targetRowId) return;
    setRows((prev) => {
      const next = reorderWithChildren(prev, draggedId, targetRowId);
      emitChange(next);
      return next;
    });
  };

  const handleDragEnd = () => {
    draggingIdRef.current = null;
    setDragOverId(null);
  };

  // ── Sub-rows ─────────────────────────────────────────────────────────────
  const addSubRow = (parentRow: InternalTableRow) => {
    if (!allowsCustomRows) return;
    const parentKey =
      typeof parentRow.row_key === 'string' && parentRow.row_key.length > 0
        ? parentRow.row_key
        : parentRow.__internal_id;
    setRows((prev) => {
      const parentIdx = prev.findIndex((r) => r.__internal_id === parentRow.__internal_id);
      let insertAt = parentIdx;
      for (let i = parentIdx + 1; i < prev.length; i++) {
        if (prev[i].parent_row_key === parentKey) insertAt = i;
        else break;
      }
      const newRow: InternalTableRow = {
        __internal_id: createInternalId(),
        section: parentRow.section ?? null,
        parent_row_key: parentKey,
      };
      const next = [...prev];
      next.splice(insertAt + 1, 0, newRow);
      emitChange(next);
      return next;
    });
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

    const sectionDefinitions = (definition.sections ?? []).filter(Boolean);
    const sectionMap: SectionWithRows[] = sectionDefinitions.map((section) => ({
      key: section.key,
      label: section.label,
      description: section.description,
      rows: rows.filter((row) => (row.section ?? null) === section.key)
    }));

    const unassigned = rows.filter((row) => {
      const rowSection = row.section ?? null;
      return sectionDefinitions.every((section) => section?.key !== rowSection);
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
    const isPrimaryColumn = column.key === definition.columns[0]?.key;
    const isTemplateRow = typeof row.row_key === 'string' && row.row_key.length > 0;
    const isIndented = isPrimaryColumn &&
      typeof row.parent_row_key === 'string' &&
      row.parent_row_key.length > 0;
    const indentClass = isIndented ? 'ml-4' : undefined;

    // Template-defined rows show their nutrient name as a plain label
    if (isPrimaryColumn && isTemplateRow) {
      return (
        <span className={cn('block py-1 text-sm text-foreground', isIndented && 'ml-4 text-muted-foreground')}>
          {cellValue !== null && cellValue !== undefined ? String(cellValue) : ''}
        </span>
      );
    }

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
            className={indentClass}
          />
        );
      }
      case 'measurement': {
        const measurementValue: MeasurementCellValue =
          isRecord(cellValue)
            ? {
                amount: String(cellValue.amount ?? ''),
                unit:
                  String(cellValue.unit ?? '') ||
                  (column.default_unit ??
                    column.units?.[0]?.code ??
                    '')
              }
            : {
                amount: String(cellValue ?? ''),
                unit: column.default_unit ?? column.units?.[0]?.code ?? ''
              };

        const hideUnitSelect =
          row.section === SERVING_INFO_SECTION_KEY &&
          row.row_key === SERVINGS_PER_CONTAINER_ROW_KEY;

        return (
          <div className={cn('flex gap-2', indentClass)}>
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
            />
            {!hideUnitSelect && (
              <Select
                value={measurementValue.unit}
                onValueChange={(value) =>
                  handleMeasurementChange(row.__internal_id, column, { unit: value })
                }
                disabled={disabled || column.is_editable === false}
              >
                <SelectTrigger className="h-8 w-14 shrink-0 text-xs px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(column.units ?? []).map((unit) => (
                    <SelectItem key={unit.code} value={unit.code}>
                      {unit.symbol || unit.label}
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
            className={indentClass}
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
              <h4 className="text-sm font-semibold text-foreground">
                {section.label ?? 'Additional Rows'}
              </h4>
              {section.description && (
                <p className="text-xs text-muted-foreground">{section.description}</p>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            {(() => {
              const sectionColumns = getSectionColumns(section.key);
              return (
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  {allowsCustomRows && <th className="w-6 px-1 py-2" />}
                  {sectionColumns.map((column) => (
                    <th
                      key={column.key}
                      className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    >
                      {column.label}
                    </th>
                  ))}
                  {allowsCustomRows && <th className="w-14 px-1 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {section.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={sectionColumns.length + (allowsCustomRows ? 2 : 0)}
                      className="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      {supportsSections ? 'No rows in this section yet.' : 'No rows added yet.'}
                    </td>
                  </tr>
                ) : (
                  section.rows.map((row) => {
                    const isGroupHeader = !!row.is_group_header;
                    const primaryColumnKey = sectionColumns[0]?.key;
                    const headerText = primaryColumnKey ? String(row[primaryColumnKey] ?? '') : '';

                    if (isGroupHeader) {
                      return (
                        <tr
                          key={row.__internal_id}
                          draggable={allowsCustomRows && !disabled}
                          onDragStart={(e) => handleDragStart(e, row.__internal_id)}
                          onDragOver={(e) => handleDragOver(e, row.__internal_id)}
                          onDrop={(e) => handleDrop(e, row.__internal_id)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            'group bg-background/60',
                            dragOverId === row.__internal_id && 'ring-1 ring-inset ring-primary/40'
                          )}
                        >
                          {allowsCustomRows && (
                            <td className="w-6 px-1 py-1 align-middle">
                              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 active:cursor-grabbing" />
                            </td>
                          )}
                          <td colSpan={sectionColumns.length} className="px-3 py-1 align-middle">
                            {headerText ? (
                              <input
                                value={headerText}
                                onChange={(e) =>
                                  primaryColumnKey &&
                                  handleCellChange(row.__internal_id, primaryColumnKey, e.target.value)
                                }
                                disabled={disabled}
                                placeholder="Group name…"
                                className="w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                              />
                            ) : (
                              <hr className="border-t-2 border-foreground/20" />
                            )}
                          </td>
                          {allowsCustomRows && (
                            <td className="w-14 px-1 py-1 align-middle">
                              <div className="flex items-center justify-end gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => toggleGroupHeader(row.__internal_id)}
                                  disabled={disabled}
                                  title="Remove header style"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-primary/70 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none"
                                >
                                  H
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeRow(row.__internal_id)}
                                  disabled={disabled}
                                  aria-label="Remove row"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                                >
                                  −
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    }

                    return (
                    <tr
                      key={row.__internal_id}
                      draggable={allowsCustomRows && !disabled}
                      onDragStart={(e) => handleDragStart(e, row.__internal_id)}
                      onDragOver={(e) => handleDragOver(e, row.__internal_id)}
                      onDrop={(e) => handleDrop(e, row.__internal_id)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        'group bg-background/60 transition-opacity',
                        dragOverId === row.__internal_id && 'ring-1 ring-inset ring-primary/40'
                      )}
                    >
                      {allowsCustomRows && (
                        <td className="w-6 px-1 py-2 align-middle">
                          <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 active:cursor-grabbing" />
                        </td>
                      )}
                      {sectionColumns.map((column) => (
                        <td key={column.key} className="px-3 py-2 align-top">
                          {renderCellInput(row, column)}
                        </td>
                      ))}
                      {allowsCustomRows && (
                        <td className="w-14 px-1 py-2 align-middle">
                          <div className="flex items-center justify-end gap-0.5">
                            {!row.parent_row_key && (
                              <button
                                type="button"
                                onClick={() => addSubRow(row)}
                                disabled={disabled}
                                title="Add sub-row"
                                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 hover:!text-foreground hover:bg-muted disabled:pointer-events-none"
                              >
                                <CornerDownRight className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleGroupHeader(row.__internal_id)}
                              disabled={disabled}
                              title="Make group header"
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 hover:!text-foreground hover:bg-muted disabled:pointer-events-none"
                            >
                              H
                            </button>
                            <button
                              type="button"
                              onClick={() => removeRow(row.__internal_id)}
                              disabled={disabled}
                              aria-label="Remove row"
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                            >
                              −
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })
                )}
              </tbody>
              {allowsCustomRows && (
                <tfoot>
                  <tr>
                    <td
                      colSpan={sectionColumns.length + 2}
                      className="border-t border-border/40 px-3 py-1 text-right"
                    >
                      <button
                        type="button"
                        onClick={() => addRow(section.key)}
                        disabled={disabled}
                        className="text-xs text-muted-foreground/50 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        + row
                      </button>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
              );
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}


