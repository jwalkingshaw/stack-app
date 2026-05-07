'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton, PageSkeleton } from '@/components/ui/loading-skeleton';
import { DeleteConfirmDialog } from '@/components/ui/modal-shells';
import { SettingsSecondLevelPage } from '../../components/settings-page-content';
import { SettingsDetailHeader } from '../../components/settings-detail-header';
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
import { readApiData, readApiError } from '@/lib/api-contract';

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
  is_locked?: boolean;
  is_override_capable?: boolean;
  is_write_assist_enabled?: boolean;
  is_translatable?: boolean;
  is_active: boolean;
}

interface FieldGroup { id: string; code: string; name: string; }
interface MarketChannel { id: string; code: string; name: string; is_active: boolean; }
interface MarketLocale { id: string; code: string; name: string; is_active: boolean; }
interface Market { id: string; code: string; name: string; is_active: boolean; }
interface MarketLocaleAssignment { id: string; market_id: string; locale_id: string; is_active: boolean; }

interface FieldGroupAssignment { id: string; product_fields?: Array<{ id?: string }>; }

const FIELD_TYPE_LABELS: Record<string, string> = {
  boolean: 'Boolean', date: 'Date', file: 'File', identifier: 'Identifier',
  image: 'Image', measurement: 'Measurement', multiselect: 'Multi Select',
  number: 'Number', price: 'Price', select: 'Select', table: 'Table',
  text: 'Text', textarea: 'Text Area',
};

const FIELD_CLASS_LABELS: Record<string, string> = {
  system: 'System', output: 'Output', custom: 'Custom',
};

const DESTINATION_OVERRIDE_TYPES = new Set(['text', 'textarea']);
const AI_ASSIST_TYPES = new Set(['text', 'textarea']);
const supportsDestinationOverrides = (t?: string | null) => Boolean(t && DESTINATION_OVERRIDE_TYPES.has(t));
const supportsAIAssist = (t?: string | null) => Boolean(t && AI_ASSIST_TYPES.has(t));

const isSystemField = (field: ProductField) =>
  field.field_class === 'system' || field.field_class === 'output' || field.is_locked === true;

export default function ProductFieldDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; fieldId: string }>;
}) {
  const { tenant, fieldId } = use(params);
  const router = useRouter();

  const [field, setField] = useState<ProductField | null>(null);
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [channels, setChannels] = useState<MarketChannel[]>([]);
  const [locales, setLocales] = useState<MarketLocale[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketLocales, setMarketLocales] = useState<MarketLocaleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showAdvancedCode, setShowAdvancedCode] = useState(false);
  const scopeLoadedRef = useRef(false);

  const [formData, setFormData] = useState({
    name: '', code: '', description: '', is_required: false, is_unique: false,
    is_localizable: false, is_channelable: false,
    allowed_channel_ids: [] as string[], allowed_locale_ids: [] as string[], allowed_market_ids: [] as string[],
    is_override_capable: false, is_write_assist_enabled: false, is_translatable: false,
    options: {} as Record<string, unknown>,
  });

  const marketLocaleMap = useCallback(() => {
    const localeById = new Map(locales.map((l) => [l.id, l]));
    const map = new Map<string, MarketLocale[]>();
    marketLocales.forEach((a) => {
      if (!a.is_active) return;
      const locale = localeById.get(a.locale_id);
      if (!locale) return;
      map.set(a.market_id, [...(map.get(a.market_id) || []), locale]);
    });
    return map;
  }, [locales, marketLocales]);

  const fetchScopeData = useCallback(async () => {
    if (scopeLoadedRef.current) return;
    try {
      setScopeLoading(true);
      const res = await fetch(`/api/${tenant}/market-context`);
      if (!res.ok) return;
      const ctx = await res.json();
      setChannels(((ctx?.channels || []) as MarketChannel[]).filter((c) => c.is_active));
      setLocales(((ctx?.locales || []) as MarketLocale[]).filter((l) => l.is_active));
      setMarkets(((ctx?.markets || []) as Market[]).filter((m) => m.is_active));
      setMarketLocales(((ctx?.marketLocales || []) as MarketLocaleAssignment[]).filter((a) => a.is_active));
      scopeLoadedRef.current = true;
    } finally {
      setScopeLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [fieldRes, groupsRes] = await Promise.all([
          fetch(`/api/${tenant}/product-fields/${fieldId}`),
          fetch(`/api/${tenant}/field-groups`),
        ]);

        const fieldPayload = await fieldRes.json().catch(() => null);
        if (!fieldRes.ok) { setError(readApiError(fieldPayload, 'Field not found')); return; }

        const loadedField = readApiData<ProductField>(fieldPayload, null);
        if (!loadedField) { setError('Field not found'); return; }

        setField(loadedField);
        setFormData({
          name: loadedField.name,
          code: loadedField.code,
          description: loadedField.description ?? '',
          is_required: loadedField.is_required,
          is_unique: loadedField.is_unique,
          is_localizable: loadedField.is_localizable,
          is_channelable: loadedField.is_channelable,
          allowed_channel_ids: loadedField.allowed_channel_ids || [],
          allowed_locale_ids: loadedField.allowed_locale_ids || [],
          allowed_market_ids: loadedField.allowed_market_ids || [],
          is_override_capable: loadedField.is_override_capable === true,
          is_write_assist_enabled: loadedField.is_write_assist_enabled === true,
          is_translatable: loadedField.is_translatable === true,
          options: loadedField.options || {},
        });

        if (groupsRes.ok) {
          const groupsPayload = await groupsRes.json().catch(() => []);
          const groups = readApiData<FieldGroup[]>(groupsPayload, []);
          setFieldGroups(groups);
          const assignedGroup = (groups as unknown as FieldGroupAssignment[]).find(
            (g) => Array.isArray(g.product_fields) && g.product_fields.some((f) => f?.id === loadedField.id)
          );
          setSelectedGroupId(assignedGroup?.id ?? null);
        }
      } catch {
        setError('Failed to load field');
      } finally {
        setLoading(false);
      }
    };
    void load();
    void fetchScopeData();
  }, [tenant, fieldId, fetchScopeData]);

  const handleSave = async () => {
    if (!field) return;
    try {
      setSaving(true);
      setSaveError(null);

      const res = await fetch(`/api/${tenant}/product-fields/${field.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, field_type: field.field_type, sort_order: field.sort_order }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) { setSaveError(readApiError(payload, 'Failed to save')); return; }

      const groupRes = await fetch(`/api/${tenant}/product-fields/${field.id}/field-group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_group_id: selectedGroupId }),
      });
      if (!groupRes.ok) {
        const gp = await groupRes.json().catch(() => null);
        setSaveError(readApiError(gp, 'Saved field but failed to update group'));
        return;
      }

      setField((prev) => prev ? { ...prev, ...formData } : prev);
    } catch {
      setSaveError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (newName: string) => {
    if (!field) return;
    const prev = field.name;
    setField((f) => f ? { ...f, name: newName } : f);
    setFormData((d) => ({ ...d, name: newName }));
    const res = await fetch(`/api/${tenant}/product-fields/${field.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, name: newName, field_type: field.field_type, sort_order: field.sort_order }),
    });
    if (!res.ok) {
      setField((f) => f ? { ...f, name: prev } : f);
      setFormData((d) => ({ ...d, name: prev }));
    }
  };

  const handleEditDescription = async (newDescription: string) => {
    if (!field) return;
    const prev = field.description;
    setField((f) => f ? { ...f, description: newDescription || null } : f);
    setFormData((d) => ({ ...d, description: newDescription }));
    const res = await fetch(`/api/${tenant}/product-fields/${field.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newDescription || null }),
    });
    if (!res.ok) {
      setField((f) => f ? { ...f, description: prev } : f);
      setFormData((d) => ({ ...d, description: prev ?? '' }));
    }
  };

  const handleDelete = async () => {
    if (!field) return;
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      const res = await fetch(`/api/${tenant}/product-fields/${field.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setDeleteError(readApiError(payload, 'Failed to delete'));
        return;
      }
      router.push(`/${tenant}/settings/product-fields`);
    } catch {
      setDeleteError('Failed to delete field');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="h-full bg-background"><PageSkeleton text="Loading attribute..." size="lg" variant="settings-detail" /></div>;

  if (error || !field) return (
    <div className="h-full bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 mb-4">{error || 'Attribute not found'}</p>
        <Button variant="outline" onClick={() => router.push(`/${tenant}/settings/product-fields`)}>Back to Attributes</Button>
      </div>
    </div>
  );

  const isSystem = isSystemField(field);
  const typeLabel = FIELD_TYPE_LABELS[field.field_type] ?? field.field_type;
  const classLabel = FIELD_CLASS_LABELS[field.field_class ?? 'custom'] ?? 'Custom';
  const mlMap = marketLocaleMap();

  return (
    <>
      <SettingsSecondLevelPage page="product-field-detail">
        <SettingsDetailHeader
          backHref={`/${tenant}/settings/product-fields`}
          backLabel="Product Fields"
          title={field.name}
          onRename={isSystem ? undefined : handleRename}
          description={field.description}
          onEditDescription={isSystem ? undefined : handleEditDescription}
          descriptionPlaceholder="Add a description..."
          meta={[{ label: typeLabel }, { label: classLabel }]}
          actions={
            !isSystem ? (
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                onClick={() => { setDeleteError(null); setShowDeleteDialog(true); }}
              >
                Delete
              </Button>
            ) : (
              <Badge variant="neutral">System field</Badge>
            )
          }
        />

        {saveError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
        )}

        {/* General */}
        <section className="space-y-5">
          <h3 className="text-base font-semibold">General</h3>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Attribute code</span>
              <Badge variant="secondary" className="font-mono text-xs">{formData.code}</Badge>
              {!isSystem && (
                <button
                  type="button"
                  onClick={() => setShowAdvancedCode((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  {showAdvancedCode ? 'Cancel' : 'Edit'}
                </button>
              )}
            </div>
            {showAdvancedCode && !isSystem && (
              <div className="space-y-1.5">
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData((d) => ({ ...d, code: e.target.value }))}
                  className="font-mono max-w-xs"
                />
                {formData.code !== field.code && (
                  <p className="text-xs text-amber-700">Changing the code affects integrations referencing this field.</p>
                )}
              </div>
            )}
          </div>

          {/* Group assignment */}
          <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4 space-y-3">
            <h4 className="text-sm font-semibold">Attribute Group</h4>
            {fieldGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attribute groups yet.</p>
            ) : (
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm hover:bg-muted/40">
                  <input type="radio" checked={!selectedGroupId} onChange={() => setSelectedGroupId(null)} disabled={isSystem} className="h-4 w-4" />
                  <span className="font-medium">Unassigned</span>
                </label>
                {fieldGroups.map((g) => (
                  <label key={g.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm hover:bg-muted/40">
                    <input type="radio" checked={selectedGroupId === g.id} onChange={() => setSelectedGroupId(g.id)} disabled={isSystem} className="h-4 w-4" />
                    <span className="font-medium">{g.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Validation */}
        {field.field_type !== 'identifier' && (
          <section className="space-y-5">
            <h3 className="text-base font-semibold">Validation</h3>

            <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4 space-y-4">
              <h4 className="text-sm font-semibold">Properties</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ['is_required', 'Required'],
                  ['is_unique', 'Unique values'],
                  ['is_localizable', 'Locale versions'],
                  ['is_channelable', 'Destination availability'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={formData[key]}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((d) => ({
                          ...d,
                          [key]: checked,
                          ...(key === 'is_localizable' && !checked ? { allowed_locale_ids: [], allowed_market_ids: [] } : {}),
                          ...(key === 'is_channelable' && !checked ? { allowed_channel_ids: [] } : {}),
                        }));
                      }}
                      disabled={isSystem}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                {([
                  ['is_write_assist_enabled', 'Write', 'AI-assisted content drafting.', supportsAIAssist(field.field_type), ''],
                  ['is_translatable', 'Adapt', 'Locale adaptation and translation.', supportsAIAssist(field.field_type) && formData.is_localizable, !formData.is_localizable ? 'Requires Locale versions.' : ''],
                  ['is_override_capable', 'Allow destination versions', 'A separate version for each destination.', supportsDestinationOverrides(field.field_type), ''],
                ] as const).map(([key, name, desc, enabled, note]) => (
                  <div key={key} className="rounded-md border border-border/60 bg-background px-4 py-3 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={formData[key as 'is_write_assist_enabled' | 'is_translatable' | 'is_override_capable']}
                      onChange={(e) => setFormData((d) => ({ ...d, [key]: e.target.checked }))}
                      disabled={isSystem || !enabled}
                      className="mt-1 h-4 w-4 disabled:opacity-50"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(formData.is_channelable || formData.is_localizable) && (
              <div className="rounded-lg border border-border/60 bg-muted/10 px-5 py-4 space-y-4">
                <h4 className="text-sm font-semibold">Locale & Destination Availability</h4>
                {scopeLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoadingSkeleton size="sm" /><span>Loading...</span></div>}
                <div className="grid gap-4 sm:grid-cols-2">
                  {formData.is_channelable && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Destinations</p>
                      {channels.length === 0 ? <p className="text-xs text-muted-foreground">No destinations defined yet.</p> : channels.map((c) => {
                        const checked = formData.allowed_channel_ids.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={checked} onChange={() => setFormData((d) => ({ ...d, allowed_channel_ids: checked ? d.allowed_channel_ids.filter((id) => id !== c.id) : [...d.allowed_channel_ids, c.id] }))} className="h-4 w-4" />
                            <span>{c.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {formData.is_localizable && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operational Markets</p>
                      {markets.map((m) => {
                        const mChecked = formData.allowed_market_ids.includes(m.id);
                        const mLocales = mlMap.get(m.id) || [];
                        const mLocaleIds = mLocales.map((l) => l.id);
                        return (
                          <div key={m.id} className="rounded-md border border-border/60 bg-background px-3 py-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={mChecked}
                                onChange={() => setFormData((d) => ({
                                  ...d,
                                  allowed_market_ids: mChecked ? d.allowed_market_ids.filter((id) => id !== m.id) : [...d.allowed_market_ids, m.id],
                                  allowed_locale_ids: mChecked ? d.allowed_locale_ids.filter((id) => !mLocaleIds.includes(id)) : d.allowed_locale_ids,
                                }))}
                                className="h-4 w-4"
                              />
                              <span className="font-medium">{m.name}</span>
                            </label>
                            {mChecked && (
                              <div className="mt-2 space-y-1 pl-6">
                                {mLocales.map((l) => {
                                  const lChecked = formData.allowed_locale_ids.includes(l.id);
                                  return (
                                    <label key={l.id} className="flex items-center gap-2 text-sm">
                                      <input type="checkbox" checked={lChecked} onChange={() => setFormData((d) => ({ ...d, allowed_locale_ids: lChecked ? d.allowed_locale_ids.filter((id) => id !== l.id) : [...d.allowed_locale_ids, l.id] }))} className="h-4 w-4" />
                                      <span>{l.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Type-specific */}
        <section className="space-y-5">
          <h3 className="text-base font-semibold">Type-specific settings</h3>
          {field.field_type === 'text' && <TextField value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o }))} />}
          {field.field_type === 'textarea' && <TextAreaField value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o as Record<string, unknown> }))} />}
          {field.field_type === 'number' && <NumberField value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o as Record<string, unknown> }))} />}
          {field.field_type === 'boolean' && <BooleanField value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o as Record<string, unknown> }))} />}
          {field.field_type === 'date' && <DateField value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o as Record<string, unknown> }))} />}
          {field.field_type === 'measurement' && <MeasurementField tenantSlug={tenant} value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o }))} />}
          {field.field_type === 'file' && <FileField value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o as Record<string, unknown> }))} />}
          {field.field_type === 'image' && <ImageField value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o as Record<string, unknown> }))} />}
          {field.field_type === 'price' && <PriceField value={formData.options} onChange={(o) => setFormData((d) => ({ ...d, options: o as Record<string, unknown> }))} />}
          {field.field_type === 'table' && (
            <TableField
              tenantSlug={tenant}
              value={(formData.options as TableFieldOptions) || {}}
              onChange={(o) => setFormData((d) => ({ ...d, options: o as Record<string, unknown> }))}
            />
          )}
          {field.field_type === 'select' && (
            <SelectField
              value={formData.options && 'options' in formData.options ? (formData.options as { options: Array<{ id: string; label: string; value: string; sort_order?: number }> }) : { options: [] }}
              onChange={(o) => setFormData((d) => ({ ...d, options: o as unknown as Record<string, unknown> }))}
            />
          )}
          {field.field_type === 'multiselect' && (
            <MultiSelectField
              value={formData.options && 'options' in formData.options ? (formData.options as { options: Array<{ id: string; label: string; value: string; sort_order?: number }>; allowEmpty?: boolean; placeholder?: string; defaultValue?: string[]; max_selections?: number; min_selections?: number }) : { options: [] }}
              onChange={(o) => setFormData((d) => ({ ...d, options: o as unknown as Record<string, unknown> }))}
            />
          )}
          {field.field_type === 'identifier' && (
            <p className="text-sm text-muted-foreground rounded-lg border border-border/60 bg-muted/10 px-5 py-4">
              Identifier attributes are always required, unique, and not scoped by destination or locale.
            </p>
          )}
        </section>

        {!isSystem && (
          <div className="flex justify-end pt-2">
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        )}
      </SettingsSecondLevelPage>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setDeleteError(null); }}
        title="Delete Attribute"
        description={`Delete "${field.name}" permanently. This action cannot be undone.`}
        onConfirm={() => void handleDelete()}
        confirmLabel="Delete attribute"
        confirmLoading={deleteLoading}
        safetyMode="typed"
        confirmPhrase="delete"
      >
        {deleteError && <div className="rounded p-3 text-sm text-red-700 bg-red-50 border border-red-200">{deleteError}</div>}
      </DeleteConfirmDialog>
    </>
  );
}
