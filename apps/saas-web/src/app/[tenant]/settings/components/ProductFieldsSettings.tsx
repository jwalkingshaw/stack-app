'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Type,
  FileText,
  Calendar,
  List,
  Image,
  ToggleLeft,
  Hash,
  DollarSign,
  Ruler,
  Table,
  KeyRound,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { DeleteConfirmDialog, FullscreenFormModal } from '@/components/ui/modal-shells';
import { SettingsPageContent } from './settings-page-content';
import { ItemList } from '@/components/ui/item-list';
import { readApiData, readApiError } from '@/lib/api-contract';
import IdentifierField from '@/components/field-types/IdentifierField';
import TextField from '@/components/field-types/TextField';
import TextAreaField from '@/components/field-types/TextAreaField';
import MeasurementField from '@/components/field-types/MeasurementField';
import NumberField from '@/components/field-types/NumberField';
import BooleanField from '@/components/field-types/BooleanField';
import DateField from '@/components/field-types/DateField';
import SelectField from '@/components/field-types/SelectField';
import MultiSelectField from '@/components/field-types/MultiSelectField';
import FileField from '@/components/field-types/FileField';
import ImageField from '@/components/field-types/ImageField';
import PriceField from '@/components/field-types/PriceField';
import { TableField, TableFieldOptions } from '@/components/field-types/TableField';

interface ProductField {
  id: string;
  code: string;
  name: string;
  description: string | null;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  is_localizable: boolean;
  is_channelable: boolean;
  allowed_channel_ids?: string[];
  allowed_locale_ids?: string[];
  allowed_market_ids?: string[];
  sort_order: number;
  default_value?: string;
  validation_rules?: Record<string, unknown>;
  options?: Record<string, unknown>;
  field_class?: 'system' | 'output' | 'custom' | string;
  system_key?: string | null;
  is_locked?: boolean;
  is_override_capable?: boolean;
  is_write_assist_enabled?: boolean;
  is_translatable?: boolean;
  scope_policy?: string | null;
  data_domain?: string | null;
  value_storage_strategy?: string | null;
  template_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FieldGroup {
  id: string;
  code: string;
  name: string;
}

interface MarketChannel {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface MarketLocale {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface Market {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface MarketLocaleAssignment {
  id: string;
  market_id: string;
  locale_id: string;
  is_active: boolean;
}

interface ProductFieldsSettingsProps {
  tenantSlug: string;
}

interface FieldTypeOption {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface ActiveRecord {
  is_active?: boolean;
}

interface FieldGroupAssignment {
  id: string;
  product_fields?: Array<{ id?: string }>;
}

const SYSTEM_FIELD_CODES = new Set([
  'facts_panel',
  'ingredients',
  'other_ingredients',
  'title',
  'brand_name',
  'scin',
  'sku',
  'barcode',
  'coa_documents',
  'coc_documents',
  'label_panel_documents',
  'spec_sheet_documents',
  'sell_sheet_documents',
  'supporting_documents',
  'legal_documents',
  'sfp_documents',
  'manufacturer_name',
  'unit_count',
  'package_type',
  'allergen_statement',
]);

const isSystemAttribute = (field: ProductField) =>
  field.field_class === 'system' ||
  field.field_class === 'output' ||
  field.is_locked === true ||
  SYSTEM_FIELD_CODES.has(field.code) ||
  field.options?.is_system === true;

const FIELD_CLASS_LABELS: Record<string, string> = {
  system: 'System',
  output: 'Output',
  custom: 'Custom',
};

const FIELD_TYPES: FieldTypeOption[] = [
  { id: "boolean", label: "Boolean", icon: ToggleLeft, description: "Boolean true/false" },
  { id: "date", label: "Date", icon: Calendar, description: "Date picker" },
  { id: "file", label: "File", icon: FileText, description: "File upload" },
  { id: "identifier", label: "Identifier", icon: KeyRound, description: "SKU, UPC, or other unique product identifier" },
  { id: "image", label: "Image", icon: Image, description: "Image upload" },
  { id: "measurement", label: "Measurement", icon: Ruler, description: "Values with units" },
  { id: "multiselect", label: "Multi Select", icon: List, description: "Multiple choices from options" },
  { id: "number", label: "Number", icon: Hash, description: "Numeric values" },
  { id: "price", label: "Price", icon: DollarSign, description: "Currency values" },
  { id: "select", label: "Select", icon: List, description: "Single choice from options" },
  { id: "table", label: "Table", icon: Table, description: "Structured data table" },
  { id: "text", label: "Text", icon: Type, description: "Single line text input" },
  { id: "textarea", label: "Text Area", icon: FileText, description: "Multi-line text input" }
];

const DEFAULT_TABLE_FIELD_DEFINITION = {
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

const cloneDefaultTableDefinition = () =>
  JSON.parse(JSON.stringify(DEFAULT_TABLE_FIELD_DEFINITION));

const generateCode = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
};

const DESTINATION_OVERRIDE_FIELD_TYPES = new Set(['text', 'textarea']);
const AI_ASSIST_FIELD_TYPES = new Set(['text', 'textarea']);

const supportsDestinationOverrides = (fieldType: string | null | undefined) =>
  Boolean(fieldType && DESTINATION_OVERRIDE_FIELD_TYPES.has(fieldType));

const supportsAIAssist = (fieldType: string | null | undefined) =>
  Boolean(fieldType && AI_ASSIST_FIELD_TYPES.has(fieldType));

export default function ProductFieldsSettings({ tenantSlug }: ProductFieldsSettingsProps) {
  // State
  const [fields, setFields] = useState<ProductField[]>([]);
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([]);
  const [channels, setChannels] = useState<MarketChannel[]>([]);
  const [locales, setLocales] = useState<MarketLocale[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketLocales, setMarketLocales] = useState<MarketLocaleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeDataLoading, setScopeDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const scopeDataReadyRef = useRef(false);
  const scopeDataRequestRef = useRef<Promise<void> | null>(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectedField, setSelectedField] = useState<ProductField | null>(null);
  const [selectedFieldType, setSelectedFieldType] = useState<FieldTypeOption | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    field_type: '',
    is_required: false,
    is_unique: false,
    is_localizable: false,
    is_channelable: false,
    allowed_channel_ids: [] as string[],
    allowed_locale_ids: [] as string[],
    allowed_market_ids: [] as string[],
    sort_order: 1,
    default_value: '',
    is_override_capable: false,
    is_write_assist_enabled: false,
    is_translatable: false,
    validation_rules: {},
    options: {} as Record<string, unknown>,
    table_definition: undefined as Record<string, unknown> | undefined
  });
  const [selectedFieldGroupId, setSelectedFieldGroupId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [hasCustomCode, setHasCustomCode] = useState(false);

  const fetchScopeData = useCallback(async () => {
    if (scopeDataReadyRef.current) return;
    if (scopeDataRequestRef.current) {
      await scopeDataRequestRef.current;
      return;
    }

    const request = (async () => {
      try {
        setScopeDataLoading(true);
        const response = await fetch(`/api/${tenantSlug}/market-context`);
        if (!response.ok) {
          console.error('Failed to fetch market context:', response.status);
          return;
        }

        const marketContext = await response.json();
        setChannels(((marketContext?.channels || []) as ActiveRecord[]).filter((item) => item.is_active) as MarketChannel[]);
        setLocales(((marketContext?.locales || []) as ActiveRecord[]).filter((item) => item.is_active) as MarketLocale[]);
        setMarkets(((marketContext?.markets || []) as ActiveRecord[]).filter((item) => item.is_active) as Market[]);
        setMarketLocales(
          ((marketContext?.marketLocales || []) as ActiveRecord[]).filter((item) => item.is_active) as MarketLocaleAssignment[]
        );
        scopeDataReadyRef.current = true;
      } catch (err) {
        console.error('Error fetching market context:', err);
      } finally {
        setScopeDataLoading(false);
      }
    })();

    scopeDataRequestRef.current = request;
    try {
      await request;
    } finally {
      scopeDataRequestRef.current = null;
    }
  }, [tenantSlug]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [fieldsResponse, groupsResponse] = await Promise.all([
        fetch(`/api/${tenantSlug}/product-fields`),
        fetch(`/api/${tenantSlug}/field-groups`)
      ]);

      // Handle fields response
      if (fieldsResponse.ok) {
        const fieldsPayload = await fieldsResponse.json().catch(() => []);
        const nextFields = readApiData<ProductField[]>(fieldsPayload, []).map((field) => ({
          ...field,
          description: typeof field.description === 'string' ? field.description : null,
          default_value: typeof field.default_value === 'string' ? field.default_value : '',
        }));
        setFields(nextFields);
      } else {
        console.error('Failed to fetch attributes:', fieldsResponse.status);
        setFields([]); // Set empty array instead of failing
      }

      // Handle groups response
      if (groupsResponse.ok) {
        const groupsPayload = await groupsResponse.json().catch(() => []);
        setFieldGroups(readApiData<FieldGroup[]>(groupsPayload, []));
      } else {
        console.error('Failed to fetch field groups:', groupsResponse.status);
        setFieldGroups([]); // Set empty array instead of failing
      }

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      // Ensure we still have empty arrays to render the table
      setFields([]);
      setFieldGroups([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    scopeDataReadyRef.current = false;
    scopeDataRequestRef.current = null;
    void fetchData();
    void fetchScopeData();
  }, [fetchData, fetchScopeData]);

  const marketLocaleMap = useMemo(() => {
    const localeById = new Map(locales.map((locale) => [locale.id, locale]));
    const map = new Map<string, MarketLocale[]>();
    marketLocales.forEach((assignment) => {
      if (!assignment.is_active) return;
      const locale = localeById.get(assignment.locale_id);
      if (!locale) return;
      const list = map.get(assignment.market_id) || [];
      list.push(locale);
      map.set(assignment.market_id, list);
    });
    return map;
  }, [locales, marketLocales]);

  // Auto-generate code when name changes
  useEffect(() => {
    if (!formData.name || (selectedField && showEditDialog)) {
      return;
    }

    if (!hasCustomCode) {
      const autoCode = generateCode(formData.name);
      setFormData(prev => (prev.code === autoCode ? prev : { ...prev, code: autoCode }));
    }
  }, [formData.name, selectedField, showEditDialog, hasCustomCode]);

  // Create field
  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.code.trim() || !formData.field_type) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/product-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readApiError(responsePayload, 'Failed to create attribute'));
      }

      const createdField = readApiData<{ id: string } | null>(responsePayload, null);
      if (!createdField?.id) {
        throw new Error('Attribute created but response payload was incomplete.');
      }

      // Assign field to selected field groups
      if (selectedFieldGroupId) {
        const assignmentResponse = await fetch(
          `/api/${tenantSlug}/product-fields/${createdField.id}/field-group`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field_group_id: selectedFieldGroupId })
          }
        );

        if (!assignmentResponse.ok) {
          const errorData = await assignmentResponse.json().catch(() => null);
          console.error('Failed to assign field to group:', errorData);
        }
      }

      await fetchData(); // Refresh list
      setShowCreateDialog(false);
      setShowTypeSelector(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create attribute');
    } finally {
      setFormLoading(false);
    }
  };

  // Update field
  const handleUpdate = async () => {
    if (!selectedField || !formData.name.trim() || !formData.code.trim()) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/product-fields/${selectedField.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readApiError(responsePayload, 'Failed to update attribute'));
      }

      const assignmentResponse = await fetch(
        `/api/${tenantSlug}/product-fields/${selectedField.id}/field-group`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field_group_id: selectedFieldGroupId })
        }
      );

      if (!assignmentResponse.ok) {
        const errorData = await assignmentResponse.json().catch(() => null);
        throw new Error(readApiError(errorData, 'Failed to update attribute group'));
      }

      await fetchData(); // Refresh list
      setShowEditDialog(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update attribute');
    } finally {
      setFormLoading(false);
    }
  };

  // Delete field
  const handleDelete = async () => {
    if (!selectedField) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/product-fields/${selectedField.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(readApiError(errorData, 'Failed to delete attribute'));
      }

      await fetchData(); // Refresh list
      setShowDeleteDialog(false);
      setSelectedField(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete attribute');
    } finally {
      setFormLoading(false);
    }
  };

  // Helper functions
  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      field_type: '',
      is_required: false,
      is_unique: false,
      is_localizable: false,
      is_channelable: false,
      allowed_channel_ids: [],
      allowed_locale_ids: [],
      allowed_market_ids: [],
      sort_order: fields.length + 1,
      default_value: '',
      is_override_capable: false,
      is_write_assist_enabled: false,
      is_translatable: false,
      validation_rules: {},
      options: {},
      table_definition: undefined
    });
    setSelectedField(null);
    setSelectedFieldType(null);
    setSelectedFieldGroupId(null);
    setError(null);
    setShowAdvancedSettings(false);
    setHasCustomCode(false);
  };

  const openCreateDialog = () => {
    resetForm();
    setError(null);
    void fetchScopeData();
    setShowTypeSelector(true);
  };

  const selectFieldType = (fieldType: FieldTypeOption) => {
    setSelectedFieldType(fieldType);
    setFormData((prev) => {
      const isIdentifier = fieldType.id === 'identifier';
      const isTable = fieldType.id === 'table';

      const existingOptions =
        prev.options && typeof prev.options === 'object' ? prev.options : {};

      let nextOptions: Record<string, unknown>;
      let nextTableDefinition: Record<string, unknown> | undefined;

      if (isTable) {
        const baseDefinition =
          existingOptions.table_definition
            ? JSON.parse(JSON.stringify(existingOptions.table_definition))
            : prev.table_definition
            ? JSON.parse(JSON.stringify(prev.table_definition))
            : cloneDefaultTableDefinition();

        nextOptions = {
          ...existingOptions,
          table_definition: baseDefinition
        };
        nextTableDefinition = JSON.parse(JSON.stringify(baseDefinition));
      } else {
        const rest = { ...existingOptions };
        delete rest.table_definition;
        delete rest.template_reference;
        nextOptions = rest;
        nextTableDefinition = undefined;
      }

      return {
        ...prev,
        field_type: fieldType.id,
        is_required: isIdentifier ? true : prev.is_required,
        is_unique: isIdentifier ? true : prev.is_unique,
        is_localizable: isIdentifier ? false : prev.is_localizable,
        is_channelable: isIdentifier ? false : prev.is_channelable,
        allowed_channel_ids: isIdentifier ? [] : prev.allowed_channel_ids || [],
        allowed_locale_ids: isIdentifier ? [] : prev.allowed_locale_ids || [],
        allowed_market_ids: isIdentifier ? [] : prev.allowed_market_ids || [],
        table_definition: nextTableDefinition,
        is_override_capable:
          isIdentifier || !supportsDestinationOverrides(fieldType.id)
            ? false
            : prev.is_override_capable,
        is_write_assist_enabled:
          !supportsAIAssist(fieldType.id) ? false : prev.is_write_assist_enabled,
        is_translatable:
          !supportsAIAssist(fieldType.id) ? false : prev.is_translatable,
        options: nextOptions
      };
    });
    setShowTypeSelector(false);
    setShowCreateDialog(true);
    setHasCustomCode(false);
    setShowAdvancedSettings(false);
  };

  const openEditDialog = (field: ProductField) => {
    void fetchScopeData();
    setSelectedField(field);
    setSelectedFieldType(FIELD_TYPES.find(t => t.id === field.field_type) ?? null);
    const tableDefinition = field.options?.table_definition
      ? JSON.parse(JSON.stringify(field.options.table_definition))
      : undefined;
    setFormData({
      name: field.name,
      code: field.code,
      description: field.description ?? '',
      field_type: field.field_type,
      is_required: field.is_required,
      is_unique: field.is_unique,
      is_localizable: field.is_localizable,
      is_channelable: field.is_channelable,
      allowed_channel_ids: field.allowed_channel_ids || [],
      allowed_locale_ids: field.allowed_locale_ids || [],
      allowed_market_ids: field.allowed_market_ids || [],
      sort_order: field.sort_order,
      default_value: field.default_value || '',
      is_override_capable: field.is_override_capable === true,
      is_write_assist_enabled: field.is_write_assist_enabled === true,
      is_translatable: field.is_translatable === true,
      validation_rules: field.validation_rules || {},
      options: field.options || {},
      table_definition: tableDefinition
    });
    setHasCustomCode(true);
    setShowAdvancedSettings(false);
    setShowEditDialog(true);
  };

  const getAssignedGroupId = useCallback((fieldId: string) => {
    const assigned = (fieldGroups as unknown as FieldGroupAssignment[])
      .filter((group) =>
        Array.isArray(group.product_fields) &&
        group.product_fields.some((field) => field?.id === fieldId)
      )
      .map((group) => group.id);
    return assigned[0] || null;
  }, [fieldGroups]);

  useEffect(() => {
    if (showEditDialog && selectedField) {
      setSelectedFieldGroupId(getAssignedGroupId(selectedField.id));
    }
  }, [showEditDialog, selectedField, getAssignedGroupId]);

  const filteredFields = useMemo(
    () => fields
      .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [fields, searchQuery]
  );

  return (
    <SettingsPageContent page="product-fields">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Attributes</h2>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search attributes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      <ItemList
        items={filteredFields}
        getKey={(f) => f.id}
        renderTitle={(f) => f.name}
        renderSubtitle={(f) => {
          const typeLabel = FIELD_TYPES.find(t => t.id === f.field_type)?.label ?? f.field_type;
          const classLabel = FIELD_CLASS_LABELS[f.field_class ?? 'custom'] ?? 'Custom';
          return `${typeLabel} • ${classLabel}`;
        }}
        getStatus={(f) => (f.is_active ? 'active' : 'inactive')}
        onClickItem={openEditDialog}
        isLocked={isSystemAttribute}
        loading={loading}
        loadingRows={8}
        emptyMessage={searchQuery ? 'No attributes match your search.' : 'No attributes yet. Create your first attribute.'}
        headerLabel="attributes"
        onCreate={openCreateDialog}
        createLabel="Add attribute"
      />

      {/* Field Type Selector Dialog */}
      <FullscreenFormModal
        open={showTypeSelector}
        title="Choose Attribute Type"
        onOpenChange={setShowTypeSelector}
        onBack={() => setShowTypeSelector(false)}
        frameBody={false}
        bodyClassName="flex min-h-[calc(100vh-9rem)] items-center justify-center p-0"
      >
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_TYPES.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => selectFieldType(type)}
                className="group flex h-28 w-full flex-col gap-2 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-sm font-semibold text-foreground">{type.label}</div>
                  <p className="text-xs leading-[1.2] text-muted-foreground">{type.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </FullscreenFormModal>

      {/* Create/Edit Dialog */}
      <FullscreenFormModal
        open={showCreateDialog || showEditDialog}
        title={`${showEditDialog ? 'Edit' : 'Create'} ${selectedFieldType?.label ?? ''} Attribute`}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setShowEditDialog(false);
            resetForm();
          }
        }}
        onBack={() => {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          resetForm();
        }}
        primaryActionLabel={showEditDialog ? 'Update Attribute' : 'Create Attribute'}
        onPrimaryAction={() => void (showEditDialog ? handleUpdate() : handleCreate())}
        primaryActionDisabled={formLoading || !formData.name.trim() || !formData.code.trim() || !formData.field_type}
        primaryActionLoading={formLoading}
        primaryActionLoadingLabel={showEditDialog ? 'Updating...' : 'Creating...'}
      >
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-10">
                    <section className="space-y-6">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground">General</h3>
                        <p className="text-sm text-muted-foreground">
                          Core attribute details visible to your team.
                        </p>
                      </div>

                  {/* Basic Information */}
                  <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-foreground">Attribute Name</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="h-11"
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        This is the label your team will see when adding product data.
                      </p>
                    </div>
                    <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border/60 bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Attribute Code</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Internal identifier used for imports, integrations, and automation.
                          </p>
                        </div>
                        {formData.code && (
                          <Badge variant="secondary" className="font-mono text-xs uppercase tracking-wide">
                            {formData.code}
                          </Badge>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedSettings((prev) => !prev)}
                        className="w-fit text-sm font-medium text-primary transition-colors hover:underline"
                      >
                        {showAdvancedSettings ? 'Hide advanced settings' : 'Edit attribute code'}
                      </button>
                      {showAdvancedSettings && (
                        <div className="space-y-3">
                          <Input
                            value={formData.code}
                            onChange={(e) => {
                              setHasCustomCode(true);
                              setFormData({ ...formData, code: e.target.value });
                            }}
                            className="font-mono"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>Use letters, numbers, and underscores only.</span>
                            {hasCustomCode && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  const autoCode = generateCode(formData.name || '');
                                  setHasCustomCode(false);
                                  setFormData((prev) => ({ ...prev, code: autoCode }));
                                }}
                              >
                                Reset to auto-generated
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="min-h-[120px] w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Attribute Groups Assignment */}
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4">
                    <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold text-foreground">Attribute Group (optional)</h4>
                      <p className="text-sm leading-6 text-muted-foreground">
                          Assign this attribute to one group to make it easier to organise templates later on.
                      </p>
                  </div>
                  {fieldGroups.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No attribute groups available yet. Create a group first.
                    </p>
                  ) : (
                      <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/40">
                            <input
                              type="radio"
                              checked={!selectedFieldGroupId}
                              onChange={() => setSelectedFieldGroupId(null)}
                              className="h-4 w-4 rounded-full border-border text-primary focus:ring-primary"
                            />
                            <span className="font-medium text-foreground">Unassigned</span>
                          </label>
                          {fieldGroups.map((group) => (
                          <label
                            key={group.id}
                            className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                          >
                              <input
                                type="radio"
                                checked={selectedFieldGroupId === group.id}
                                onChange={() => setSelectedFieldGroupId(group.id)}
                                className="h-4 w-4 rounded-full border-border text-primary focus:ring-primary"
                              />
                            <span className="font-medium text-foreground">{group.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                    </section>

                    <section className="space-y-6">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground">Validation</h3>
                        <p className="text-sm text-muted-foreground">
                          Configure data rules and where this attribute can be used.
                        </p>
                      </div>

                  {/* Attribute Properties - Hidden for identifier fields since they're predetermined */}
                    {selectedFieldType?.id !== 'identifier' && (
                      <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4">
                        <h4 className="text-sm font-semibold text-foreground">Attribute Properties</h4>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={formData.is_required}
                            onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="text-sm leading-6 text-foreground">Required field</span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={selectedFieldType?.id === 'identifier' ? true : formData.is_unique}
                            onChange={(e) => setFormData({ ...formData, is_unique: e.target.checked })}
                            disabled={selectedFieldType?.id === 'identifier'}
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-60"
                          />
                          <div className="text-sm leading-6 text-foreground">
                            <span className="block">Unique values</span>
                            {selectedFieldType?.id === 'identifier' && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Required for identifier fields
                              </span>
                            )}
                          </div>
                        </label>
                        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted/40">
                            <input
                              type="checkbox"
                              checked={formData.is_localizable}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setFormData({
                                  ...formData,
                                  is_localizable: checked,
                                  allowed_locale_ids: checked ? formData.allowed_locale_ids : [],
                                  allowed_market_ids: checked ? formData.allowed_market_ids : []
                                });
                              }}
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                          <span className="text-sm leading-6 text-foreground">Locale versions</span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-muted/40">
                            <input
                              type="checkbox"
                              checked={formData.is_channelable}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setFormData({
                                  ...formData,
                                  is_channelable: checked,
                                  allowed_channel_ids: checked ? formData.allowed_channel_ids : []
                                });
                              }}
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                          <span className="text-sm leading-6 text-foreground">Destination availability</span>
                        </label>
                        </div>
                        <div className="mt-4 space-y-3">
                        <div className="rounded-md border border-border/60 bg-background px-4 py-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={formData.is_write_assist_enabled}
                              onChange={(e) =>
                                setFormData({ ...formData, is_write_assist_enabled: e.target.checked })
                              }
                              disabled={!supportsAIAssist(formData.field_type)}
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-60"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">Write</div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Enable AI-assisted content drafting for this field. Appears inline when editing base content.
                              </p>
                              {!supportsAIAssist(formData.field_type) ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Write is supported for text and textarea fields only.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background px-4 py-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={formData.is_translatable}
                              onChange={(e) =>
                                setFormData({ ...formData, is_translatable: e.target.checked })
                              }
                              disabled={!supportsAIAssist(formData.field_type) || !formData.is_localizable}
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-60"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">Adapt</div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Enable locale adaptation for this field. Translates content into the target locale and enforces regional regulatory compliance in a single step.
                              </p>
                              {!formData.is_localizable ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Requires Locale versions to be enabled.
                                </p>
                              ) : !supportsAIAssist(formData.field_type) ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Adapt is supported for text and textarea fields only.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background px-4 py-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={formData.is_override_capable}
                              onChange={(e) =>
                                setFormData({ ...formData, is_override_capable: e.target.checked })
                              }
                              disabled={!supportsDestinationOverrides(formData.field_type)}
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-60"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                Allow destination versions
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Use this when a shared field needs an additional version for a destination like Amazon or Partner Portal.
                              </p>
                              {!supportsDestinationOverrides(formData.field_type) ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Destination versions are currently supported for text and textarea fields only.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        </div>
                      </div>
                    )}

                    {selectedFieldType?.id === 'identifier' && (
                      <div className="rounded-lg border border-border/60 bg-muted/10 px-5 py-4 text-sm text-muted-foreground">
                        Identifier attributes are always required, unique, and not scoped by destination or locale.
                      </div>
                    )}

                    {(formData.is_channelable || formData.is_localizable) && (
                      <div className="rounded-lg border border-border/60 bg-muted/10 px-5 py-4">
                        <h4 className="text-sm font-semibold text-foreground">Locale And Destination Availability</h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Limit which destinations, locales, or optional operational markets this attribute can use. Leave empty to allow all.
                        </p>
                        {scopeDataLoading && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <LoadingSkeleton size="sm" />
                            <span>Loading destinations, locales, and markets...</span>
                          </div>
                        )}
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          {formData.is_channelable && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Destinations</div>
                              <div className="space-y-2">
                                {channels.length === 0 && (
                                  <div className="text-xs text-muted-foreground">No destinations defined yet.</div>
                                )}
                                {channels.map((channel) => {
                                  const checked = (formData.allowed_channel_ids || []).includes(channel.id);
                                  return (
                                    <label key={channel.id} className="flex items-center gap-2 text-sm text-foreground">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const current = formData.allowed_channel_ids || [];
                                          const next = checked
                                            ? current.filter((id) => id !== channel.id)
                                            : [...current, channel.id];
                                          setFormData({ ...formData, allowed_channel_ids: next });
                                        }}
                                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                      />
                                      <span>{channel.name}</span>
                                      <span className="text-xs text-muted-foreground">{channel.code}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {formData.is_localizable && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operational markets</div>
                              <div className="space-y-3">
                                {markets.length === 0 && (
                                  <div className="text-xs text-muted-foreground">No operational markets defined yet.</div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Markets stay optional here and do not create field-level content branches.
                                </p>
                                {markets.map((market) => {
                                  const checked = (formData.allowed_market_ids || []).includes(market.id);
                                  const marketLocales = marketLocaleMap.get(market.id) || [];
                                  const marketLocaleIds = marketLocales.map((locale) => locale.id);
                                  return (
                                    <div key={market.id} className="rounded-md border border-border/60 bg-background px-3 py-2">
                                      <label className="flex items-center gap-2 text-sm text-foreground">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            const current = formData.allowed_market_ids || [];
                                            const nextMarkets = checked
                                              ? current.filter((id) => id !== market.id)
                                              : [...current, market.id];
                                            const nextLocales = checked
                                              ? (formData.allowed_locale_ids || []).filter(
                                                  (id) => !marketLocaleIds.includes(id)
                                                )
                                              : formData.allowed_locale_ids || [];
                                            setFormData({
                                              ...formData,
                                              allowed_market_ids: nextMarkets,
                                              allowed_locale_ids: nextLocales
                                            });
                                          }}
                                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                        />
                                        <span className="font-medium">{market.name}</span>
                                        <span className="text-xs text-muted-foreground">{market.code}</span>
                                      </label>
                                      {checked && (
                                        <div className="mt-2 space-y-2 pl-6">
                                          {marketLocales.length === 0 && (
                                            <div className="text-xs text-muted-foreground">
                                              No locales assigned to this market.
                                            </div>
                                          )}
                                          {marketLocales.map((locale) => {
                                            const localeChecked = (formData.allowed_locale_ids || []).includes(locale.id);
                                            return (
                                              <label key={locale.id} className="flex items-center gap-2 text-sm text-foreground">
                                                <input
                                                  type="checkbox"
                                                  checked={localeChecked}
                                                  onChange={() => {
                                                    const current = formData.allowed_locale_ids || [];
                                                    const next = localeChecked
                                                      ? current.filter((id) => id !== locale.id)
                                                      : [...current, locale.id];
                                                    setFormData({ ...formData, allowed_locale_ids: next });
                                                  }}
                                                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                                />
                                                <span>{locale.name}</span>
                                                <span className="text-xs text-muted-foreground">{locale.code}</span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    </section>

                    <section className="space-y-6">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground">Type-specific</h3>
                        <p className="text-sm text-muted-foreground">
                          Additional settings for {selectedFieldType?.label?.toLowerCase() || 'this'} attributes.
                        </p>
                      </div>

                    {/* Type-specific settings */}
                  <div className="space-y-6">
                  {selectedFieldType?.id === 'identifier' && <IdentifierField />}
                  {selectedFieldType?.id === 'text' && (
                    <TextField
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options })}
                    />
                  )}
                  {selectedFieldType?.id === 'textarea' && (
                    <TextAreaField
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options: options as Record<string, unknown> })}
                    />
                  )}
                  {selectedFieldType?.id === 'number' && (
                    <NumberField
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options: options as Record<string, unknown> })}
                    />
                  )}
                  {selectedFieldType?.id === 'boolean' && (
                    <BooleanField
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options: options as Record<string, unknown> })}
                    />
                  )}
                  {selectedFieldType?.id === 'date' && (
                    <DateField
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options: options as Record<string, unknown> })}
                    />
                  )}
                  {selectedFieldType?.id === 'measurement' && (
                    <MeasurementField
                      tenantSlug={tenantSlug}
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options })}
                    />
                  )}
                  {selectedFieldType?.id === 'table' && (
                    <TableField
                      tenantSlug={tenantSlug}
                      value={(formData.options as TableFieldOptions) || {}}
                      onChange={(options) =>
                        setFormData({
                          ...formData,
                          options: options as Record<string, unknown>,
                          table_definition: (options.table_definition as Record<string, unknown> | undefined) ?? formData.table_definition
                        })
                      }
                    />
                  )}
                  {selectedFieldType?.id === 'file' && (
                    <FileField
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options: options as Record<string, unknown> })}
                    />
                  )}
                  {selectedFieldType?.id === 'image' && (
                    <ImageField
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options: options as Record<string, unknown> })}
                    />
                  )}
                  {selectedFieldType?.id === 'price' && (
                    <PriceField
                      value={formData.options}
                      onChange={(options) => setFormData({ ...formData, options: options as Record<string, unknown> })}
                    />
                  )}
                </div>

                {selectedFieldType?.id === 'select' && (
                  <SelectField
                    value={
                      formData.options && 'options' in formData.options
                        ? (formData.options as { options: Array<{ id: string; label: string; value: string; sort_order?: number }> })
                        : { options: [] }
                    }
                    onChange={(options) => setFormData({ ...formData, options: options as unknown as Record<string, unknown> })}
                  />
                )}
                {selectedFieldType?.id === 'multiselect' && (
                  <MultiSelectField
                    value={
                      formData.options && 'options' in formData.options
                        ? (formData.options as {
                            options: Array<{ id: string; label: string; value: string; sort_order?: number }>;
                            allowEmpty?: boolean;
                            placeholder?: string;
                            defaultValue?: string[];
                            max_selections?: number;
                            min_selections?: number;
                          })
                        : { options: [] }
                    }
                    onChange={(options) => setFormData({ ...formData, options: options as unknown as Record<string, unknown> })}
                  />
                )}
          </section>
        </div>
      </FullscreenFormModal>

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) {
            setSelectedField(null);
          }
        }}
        title="Delete Attribute"
        description={`Are you sure you want to delete ${selectedField?.name || 'this attribute'}? This action cannot be undone.`}
        confirmLabel="Delete Attribute"
        confirmDisabled={formLoading}
        confirmLoading={formLoading}
        confirmLoadingLabel="Deleting..."
        onConfirm={() => void handleDelete()}
        safetyMode="typed"
        confirmPhrase="delete"
      >
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </DeleteConfirmDialog>
    </SettingsPageContent>
  );
}



