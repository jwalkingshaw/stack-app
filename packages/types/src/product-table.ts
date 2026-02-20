export type TableColumnType =
  | 'text'
  | 'number'
  | 'percent'
  | 'measurement'
  | 'note'
  | 'header';

export interface ProductTableUnitOption {
  code: string;
  label: string;
  symbol?: string | null;
  conversion_factor?: number | null;
}

export interface ProductTableColumn {
  key: string;
  label: string;
  type: TableColumnType;
  description?: string;
  precision?: number | null;
  is_required?: boolean;
  is_editable?: boolean;
  measurement_family_code?: string | null;
  default_unit?: string | null;
  units?: ProductTableUnitOption[];
  metadata?: Record<string, any>;
}

export interface ProductTableSectionRow {
  key: string;
  label: string;
  note?: string;
}

export interface ProductTableSection {
  key: string;
  label: string;
  description?: string;
  default_rows?: ProductTableSectionRow[];
}

export interface ProductTableMeta {
  allows_custom_rows?: boolean;
  supports_sections?: boolean;
  panel_type?: string | null;
  default_measurement_family?: string | null;
  notes?: string | null;
  template_kind?: string | null;
}

export interface ProductTableDefinition {
  columns: ProductTableColumn[];
  sections?: ProductTableSection[];
  meta: ProductTableMeta;
}

export interface ProductTableTemplate {
  id: string;
  organization_id?: string | null;
  scope: 'global' | 'organization';
  code: string;
  version: string;
  kind?: string | null;
  label: string;
  description?: string | null;
  region?: string | null;
  regulator?: string | null;
  locale?: string | null;
  definition: ProductTableDefinition;
  metadata?: Record<string, any> | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProductTableRow {
  row_key?: string;
  section?: string | null;
  notes?: string | null;
  [columnKey: string]: any;
}
