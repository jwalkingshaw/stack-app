'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { DeleteConfirmDialog } from '@/components/ui/modal-shells';
import { cn } from '@/lib/utils';
import { SettingsSecondLevelPage } from './settings-page-content';
import { SettingsDetailHeader } from './settings-detail-header';
import { readApiData, readApiError } from '@/lib/api-contract';

const PROFILE_TYPE_LABELS: Record<string, string> = {
  portal: 'Portal',
};

type OutputProfile = {
  id: string;
  name: string;
  code: string;
  profile_type: string;
  description: string | null;
  market_id: string | null;
  is_active: boolean;
  market?: { id: string; name: string; code: string } | null;
  attribute_mappings?: AttributeMapping[];
};

type AttributeMapping = {
  id: string;
  attribute_code: string;
  attribute_label: string;
  source_mode: string;
  source_field_code: string | null;
  override_field_code: string | null;
  source_slot_code: string | null;
  constant_value: string | null;
  resolution_rule: string;
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
  sort_order: number;
};

type AvailableField = {
  id: string;
  code: string;
  name: string;
  field_type: string;
};

type FieldGroup = {
  id: string;
  code: string;
  name: string;
  product_fields: AvailableField[];
};

interface OutputProfileDetailProps {
  tenantSlug: string;
  profileId: string;
}

export default function OutputProfileDetail({ tenantSlug, profileId }: OutputProfileDetailProps) {
  const [profile, setProfile] = useState<OutputProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([]);

  // Field picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerChecked, setPickerChecked] = useState<Set<string>>(new Set());
  const [addingAttributes, setAddingAttributes] = useState(false);

  // Table selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Inline rename
  const [renamingCode, setRenamingCode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Per-row toggle loading
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Attribute save / delete
  const [savingMappings, setSavingMappings] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [deleteMappingCode, setDeleteMappingCode] = useState<string | null>(null);
  const [deletingMapping, setDeletingMapping] = useState(false);

  // Active toggle
  const [togglingActive, setTogglingActive] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles/${profileId}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(readApiError(payload, 'Failed to load channel')); return; }
      setProfile(readApiData<OutputProfile>(payload, null as unknown as OutputProfile));
    } catch { setError('Failed to load channel'); }
    finally { setLoading(false); }
  }, [tenantSlug, profileId]);

  const fetchFieldGroups = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/field-groups`);
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        const groups = (Array.isArray(payload) ? payload : []) as FieldGroup[];
        setFieldGroups(groups.filter((g) => g.product_fields?.length > 0));
      }
    } catch { /* non-critical */ }
  }, [tenantSlug]);

  useEffect(() => { void fetchProfile(); void fetchFieldGroups(); }, [fetchProfile, fetchFieldGroups]);

  const attributeMappings = useMemo(
    () => (profile?.attribute_mappings ?? []).slice().sort((a, b) =>
      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.attribute_code.localeCompare(b.attribute_code)
    ),
    [profile?.attribute_mappings]
  );

  const allFields = useMemo(() => {
    const seen = new Set<string>();
    return fieldGroups.flatMap((g) => g.product_fields).filter((f) => {
      if (seen.has(f.code)) return false;
      seen.add(f.code);
      return true;
    });
  }, [fieldGroups]);

  const fieldMap = useMemo(() => new Map(allFields.map((f) => [f.code, f])), [allFields]);

  const mappedSourceCodes = useMemo(
    () => new Set(attributeMappings.map((m) => m.source_field_code).filter((v): v is string => Boolean(v))),
    [attributeMappings]
  );

  const pickerGroups = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return fieldGroups
      .map((g) => ({
        ...g,
        product_fields: g.product_fields.filter(
          (f) => !mappedSourceCodes.has(f.code) && (!q || f.name.toLowerCase().includes(q) || f.code.includes(q))
        ),
      }))
      .filter((g) => g.product_fields.length > 0);
  }, [fieldGroups, mappedSourceCodes, pickerSearch]);

  const requiredCount = attributeMappings.filter((m) => m.is_required).length;

  // Table selection helpers
  const allSelected = attributeMappings.length > 0 && attributeMappings.every((m) => selected.has(m.attribute_code));
  const someSelected = attributeMappings.some((m) => selected.has(m.attribute_code));
  const selectedCount = selected.size;

  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(attributeMappings.map((m) => m.attribute_code)));

  const toggleSelect = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });

  // Field picker helpers
  const togglePickerField = (code: string) => {
    setPickerChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const togglePickerGroup = (group: FieldGroup) => {
    const codes = group.product_fields.map((f) => f.code);
    const allChecked = codes.every((c) => pickerChecked.has(c));
    setPickerChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) { codes.forEach((c) => next.delete(c)); }
      else { codes.forEach((c) => next.add(c)); }
      return next;
    });
  };

  const closePicker = () => { setPickerOpen(false); setPickerChecked(new Set()); setPickerSearch(''); };

  const persistMappings = useCallback(async (mappings: Array<Record<string, unknown>>) => {
    setSavingMappings(true);
    setMappingError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles/${profileId}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setMappingError(readApiError(payload, 'Failed to save')); return false; }
      await fetchProfile();
      return true;
    } catch { setMappingError('Failed to save'); return false; }
    finally { setSavingMappings(false); }
  }, [fetchProfile, profileId, tenantSlug]);

  const buildPayload = (m: AttributeMapping, overrides: Partial<AttributeMapping>) => ({
    attribute_code: m.attribute_code,
    attribute_label: overrides.attribute_label ?? m.attribute_label,
    source_mode: m.source_mode,
    source_field_code: m.source_field_code,
    override_field_code: m.override_field_code,
    source_slot_code: m.source_slot_code,
    constant_value: m.constant_value,
    resolution_rule: m.resolution_rule,
    is_required: overrides.is_required ?? m.is_required,
    max_length: m.max_length,
    notes: m.notes,
    sort_order: m.sort_order,
  });

  const handleBulkAdd = async () => {
    if (pickerChecked.size === 0) return;
    setAddingAttributes(true);
    const mappings = Array.from(pickerChecked).map((code, i) => ({
      attribute_code: code,
      attribute_label: fieldMap.get(code)?.name ?? code,
      source_mode: 'shared_field',
      source_field_code: code,
      override_field_code: null,
      source_slot_code: null,
      constant_value: null,
      resolution_rule: 'base_only',
      is_required: false,
      max_length: null,
      notes: null,
      sort_order: (attributeMappings.length + i) * 10,
    }));
    const saved = await persistMappings(mappings);
    if (saved) closePicker();
    setAddingAttributes(false);
  };

  const handleToggleRequired = async (code: string, next: boolean) => {
    const m = attributeMappings.find((m) => m.attribute_code === code);
    if (!m) return;
    setTogglingIds((prev) => new Set([...prev, code]));
    await persistMappings([buildPayload(m, { is_required: next })]);
    setTogglingIds((prev) => { const s = new Set(prev); s.delete(code); return s; });
  };

  const startRename = (m: AttributeMapping) => {
    setRenamingCode(m.attribute_code);
    setRenameValue(m.attribute_label);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = async () => {
    if (!renamingCode) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      const m = attributeMappings.find((m) => m.attribute_code === renamingCode);
      if (m) await persistMappings([buildPayload(m, { attribute_label: trimmed })]);
    }
    setRenamingCode(null);
  };

  const handleBulkMarkRequired = async (required: boolean) => {
    const mappings = Array.from(selected)
      .map((id) => attributeMappings.find((m) => m.attribute_code === id))
      .filter((m): m is AttributeMapping => Boolean(m))
      .map((m) => buildPayload(m, { is_required: required }));
    if (mappings.length > 0) {
      await persistMappings(mappings);
      setSelected(new Set());
    }
  };

  const handleBulkRemove = async () => {
    for (const id of Array.from(selected)) {
      await fetch(
        `/api/${tenantSlug}/output-profiles/${profileId}/mappings?attribute_code=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
    }
    setSelected(new Set());
    await fetchProfile();
  };

  const handleDelete = async () => {
    if (!deleteMappingCode) return;
    setDeletingMapping(true);
    setMappingError(null);
    try {
      const res = await fetch(
        `/api/${tenantSlug}/output-profiles/${profileId}/mappings?attribute_code=${encodeURIComponent(deleteMappingCode)}`,
        { method: 'DELETE' }
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setMappingError(readApiError(payload, 'Failed to remove')); return; }
      setDeleteMappingCode(null);
      await fetchProfile();
    } catch { setMappingError('Failed to remove attribute'); }
    finally { setDeletingMapping(false); }
  };

  const patchProfile = async (patch: Record<string, unknown>, rollback: () => void) => {
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles/${profileId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) rollback();
    } catch { rollback(); }
  };

  const handleToggleActive = async (next: boolean) => {
    if (!profile) return;
    setTogglingActive(true);
    setProfile((prev) => prev ? { ...prev, is_active: next } : prev);
    await patchProfile({ is_active: next }, () =>
      setProfile((prev) => prev ? { ...prev, is_active: !next } : prev)
    );
    setTogglingActive(false);
  };

  const handleRenameProfile = async (newName: string) => {
    if (!profile) return;
    const prev = profile.name;
    setProfile((p) => p ? { ...p, name: newName } : p);
    await patchProfile({ name: newName }, () =>
      setProfile((p) => p ? { ...p, name: prev } : p)
    );
  };

  const handleEditDescription = async (newDescription: string) => {
    if (!profile) return;
    const prev = profile.description;
    setProfile((p) => p ? { ...p, description: newDescription || null } : p);
    await patchProfile({ description: newDescription || null }, () =>
      setProfile((p) => p ? { ...p, description: prev } : p)
    );
  };

  if (loading) return <div className="h-full bg-background"><PageSkeleton text="Loading channel..." size="lg" /></div>;
  if (error || !profile) return (
    <SettingsSecondLevelPage page="output-profile-detail">
      <SettingsDetailHeader
        backHref={`/${tenantSlug}/settings/output-profiles`}
        backLabel="Channels"
        title="Channel not found"
      />
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error ?? 'Channel not found'}</div>
    </SettingsSecondLevelPage>
  );

  const fieldPickerPanel = pickerOpen ? (
    <div className="border-b border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search fields..."
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {pickerGroups.map((group) => {
          const codes = group.product_fields.map((f) => f.code);
          const allChecked = codes.every((c) => pickerChecked.has(c));
          const someChecked = codes.some((c) => pickerChecked.has(c));
          return (
            <div key={group.code}>
              <label className="flex cursor-pointer items-center gap-2.5 bg-muted/30 px-4 py-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={() => togglePickerGroup(group)}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.name}</span>
                <span className="text-xs text-muted-foreground">({group.product_fields.length})</span>
              </label>
              {group.product_fields.map((field) => (
                <label key={field.code} className="flex cursor-pointer items-center gap-2.5 py-2 pl-9 pr-4 transition-colors hover:bg-muted/20">
                  <input
                    type="checkbox"
                    checked={pickerChecked.has(field.code)}
                    onChange={() => togglePickerField(field.code)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  <span className="text-sm text-foreground">{field.name}</span>
                </label>
              ))}
            </div>
          );
        })}
        {pickerGroups.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {pickerSearch ? 'No matching fields.' : 'All fields have already been added.'}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
        <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={closePicker}>Cancel</Button>
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={pickerChecked.size === 0 || addingAttributes || savingMappings}
          onClick={() => void handleBulkAdd()}
        >
          {addingAttributes ? 'Adding…' : `Add ${pickerChecked.size > 0 ? pickerChecked.size + ' ' : ''}${pickerChecked.size === 1 ? 'field' : 'fields'}`}
        </Button>
      </div>
    </div>
  ) : undefined;

  const meta = [
    { label: PROFILE_TYPE_LABELS[profile.profile_type] ?? profile.profile_type },
    { label: profile.code, mono: true },
    ...(profile.market ? [{ label: profile.market.name }] : []),
  ];

  return (
    <SettingsSecondLevelPage page="output-profile-detail">

      <SettingsDetailHeader
        backHref={`/${tenantSlug}/settings/output-profiles`}
        backLabel="Channels"
        title={profile.name}
        onRename={handleRenameProfile}
        description={profile.description}
        onEditDescription={handleEditDescription}
        descriptionPlaceholder="Add a channel description..."
        meta={meta}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Active</span>
            <Switch checked={profile.is_active} onCheckedChange={handleToggleActive} disabled={togglingActive} />
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2">
        {[
          { value: attributeMappings.length, label: 'Fields' },
          { value: requiredCount, label: 'Required' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 bg-card p-3 text-center">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Attributes */}
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-foreground">Attributes</h2>
        <p className="text-xs text-muted-foreground">Product fields this channel includes. Mark required to drive readiness scores.</p>
      </div>

      {mappingError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{mappingError}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        {/* Table header */}
        <div className="min-h-[44px] border-b border-gray-200 px-4">
          {someSelected ? (
            // Bulk action bar — full-width flex when rows are selected
            <div className="flex items-center gap-3 py-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
                aria-label="Select all"
              />
              <span className="text-xs font-medium text-muted-foreground">{selectedCount} selected</span>
              <div className="flex items-center gap-4">
                <button onClick={() => void handleBulkMarkRequired(true)} className="text-xs font-medium text-foreground transition-colors hover:text-muted-foreground">Mark required</button>
                <button onClick={() => void handleBulkMarkRequired(false)} className="text-xs font-medium text-foreground transition-colors hover:text-muted-foreground">Mark optional</button>
                <button onClick={() => void handleBulkRemove()} className="text-xs font-medium text-destructive transition-colors hover:text-destructive/80">Remove</button>
              </div>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground">Clear</button>
            </div>
          ) : (
            // Column headers — same grid as data rows
            <div className="grid grid-cols-[1rem_1fr_5rem_6rem] items-center gap-x-3 py-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border-gray-300"
                aria-label="Select all"
              />
              <span className="text-xs font-medium text-muted-foreground">Field</span>
              <span className="text-center text-xs font-medium text-muted-foreground">Required</span>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add fields</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Field picker panel */}
        {fieldPickerPanel}

        {/* Rows — same grid as column headers */}
        {attributeMappings.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No fields added yet. Use &quot;Add fields&quot; to select product fields for this channel.
          </div>
        ) : (
          <div>
            {attributeMappings.map((m, index) => {
              const sublabel = m.source_field_code ? fieldMap.get(m.source_field_code) : null;
              const showSublabel = sublabel && sublabel.name !== m.attribute_label;
              const isRenaming = renamingCode === m.attribute_code;
              const isToggling = togglingIds.has(m.attribute_code);

              return (
                <div key={m.attribute_code} className="relative transition-colors hover:bg-muted/30">
                  {index > 0 && <div className="absolute left-4 right-4 top-0 h-px bg-gray-200" />}
                  <div className="grid grid-cols-[1rem_1fr_5rem_6rem] items-center gap-x-3 px-4 py-3">

                    <input
                      type="checkbox"
                      checked={selected.has(m.attribute_code)}
                      onChange={() => toggleSelect(m.attribute_code)}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />

                    <div className="min-w-0">
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => void commitRename()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename();
                            if (e.key === 'Escape') setRenamingCode(null);
                          }}
                          className="w-full rounded border border-border bg-background px-2 py-0.5 text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
                          autoFocus
                        />
                      ) : (
                        <div
                          className="cursor-text truncate text-sm font-medium text-foreground underline-offset-2 decoration-muted-foreground/40 hover:underline"
                          onClick={() => startRename(m)}
                          title="Click to rename"
                        >
                          {m.attribute_label}
                        </div>
                      )}
                      {showSublabel && (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{sublabel.name}</div>
                      )}
                    </div>

                    <div className="flex justify-center">
                      <Switch
                        checked={m.is_required}
                        onCheckedChange={(next) => void handleToggleRequired(m.attribute_code, next)}
                        disabled={isToggling || savingMappings}
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => setDeleteMappingCode(m.attribute_code)}
                        className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
                        aria-label={`Remove ${m.attribute_label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        open={!!deleteMappingCode}
        onOpenChange={(open) => { if (!open) setDeleteMappingCode(null); }}
        title={`Remove "${attributeMappings.find((m) => m.attribute_code === deleteMappingCode)?.attribute_label ?? deleteMappingCode}"`}
        description="This field will be removed from the channel. Readiness scores will stop checking for it."
        onConfirm={handleDelete}
        confirmLoading={deletingMapping}
      />
    </SettingsSecondLevelPage>
  );
}
