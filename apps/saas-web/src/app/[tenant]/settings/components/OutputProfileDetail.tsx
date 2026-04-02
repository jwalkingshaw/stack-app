'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, Plus, Trash2, CheckCircle2, Circle, AlertTriangle,
  Globe, ShoppingCart, Store, FileOutput, Plug, Zap, Search, ArrowRight, ArrowLeft,
  ChevronDown, ChevronRight as ChevronRightIcon, Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { DeleteConfirmDialog } from '@/components/ui/modal-shells';
import { SettingsSecondLevelPage } from './settings-page-content';
import { readApiData, readApiError } from '@/lib/api-contract';
import { OUTPUT_PROFILE_TEMPLATES } from '@/lib/output-profile-templates';

const PROFILE_TYPE_LABELS: Record<string, string> = {
  portal:      'Partner Portal',
  marketplace: 'Marketplace',
  retail:      'Retail',
  export:      'Export / File',
  api:         'API Integration',
};

const PROFILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  portal:      <Globe className="h-4 w-4" />,
  marketplace: <ShoppingCart className="h-4 w-4" />,
  retail:      <Store className="h-4 w-4" />,
  export:      <FileOutput className="h-4 w-4" />,
  api:         <Plug className="h-4 w-4" />,
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text', textarea: 'Textarea', number: 'Number', boolean: 'Boolean',
  select: 'Select', multiselect: 'Multi-select', date: 'Date',
  measurement: 'Measurement', price: 'Price', table: 'Table', file: 'File', image: 'Image',
};

type FieldRule = {
  id: string;
  field_code: string;
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
};

type OutputProfile = {
  id: string;
  name: string;
  code: string;
  profile_type: string;
  description: string | null;
  market_id: string | null;
  is_active: boolean;
  is_primary: boolean;
  market?: { id: string; name: string; code: string } | null;
  field_rules: FieldRule[];
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

type BulkFieldConfig = {
  field: AvailableField;
  is_required: boolean;
  max_length: string;
  notes: string;
};

interface OutputProfileDetailProps {
  tenantSlug: string;
  profileId: string;
}

// ─── Inline rule editor ──────────────────────────────────────────────────────

function InlineRuleEditor({
  rule,
  fieldName,
  onSave,
  onCancel,
}: {
  rule: FieldRule;
  fieldName: string;
  onSave: (updates: { is_required: boolean; max_length: number | null; notes: string | null }) => void;
  onCancel: () => void;
}) {
  const [isRequired, setIsRequired] = useState(rule.is_required);
  const [maxLength, setMaxLength] = useState(rule.max_length ? String(rule.max_length) : '');
  const [notes, setNotes] = useState(rule.notes ?? '');

  return (
    <div className="px-4 py-3 bg-muted/30 space-y-3">
      <div className="flex items-center gap-2">
        <Switch checked={isRequired} onCheckedChange={setIsRequired} />
        <span className="text-xs text-muted-foreground">{isRequired ? 'Required' : 'Optional'}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Max length</label>
          <Input placeholder="e.g. 200" value={maxLength} onChange={(e) => setMaxLength(e.target.value)} type="number" min={1} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Input placeholder="Guidance for content team" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-7 text-xs" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 px-3 text-xs" onClick={() => {
          const ml = maxLength.trim() ? parseInt(maxLength, 10) : null;
          onSave({ is_required: isRequired, max_length: ml && ml > 0 ? ml : null, notes: notes.trim() || null });
        }}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Editing: <span className="font-medium text-foreground">{fieldName}</span></p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function OutputProfileDetail({ tenantSlug, profileId }: OutputProfileDetailProps) {
  const [profile, setProfile] = useState<OutputProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([]);

  // Add flow: 'none' | 'select' | 'configure'
  const [addStep, setAddStep] = useState<'none' | 'select' | 'configure'>('none');
  const [fieldSearch, setFieldSearch] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [checked, setChecked] = useState<Set<string>>(new Set());   // field codes
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [bulkConfigs, setBulkConfigs] = useState<BulkFieldConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Inline edit
  const [editingRuleCode, setEditingRuleCode] = useState<string | null>(null);

  // Delete
  const [deleteRuleCode, setDeleteRuleCode] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);

  // Active toggle
  const [togglingActive, setTogglingActive] = useState(false);

  // Primary toggle
  const [togglingPrimary, setTogglingPrimary] = useState(false);

  // Scaffold
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [scaffoldingKey, setScaffoldingKey] = useState<string | null>(null);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const [otherTemplatesOpen, setOtherTemplatesOpen] = useState(false);

  // Inline field creation (within select step)
  const [createFieldOpen, setCreateFieldOpen] = useState(false);
  const [createFieldName, setCreateFieldName] = useState('');
  const [createFieldType, setCreateFieldType] = useState('text');
  const [createFieldGroupCode, setCreateFieldGroupCode] = useState('');
  const [creatingField, setCreatingField] = useState(false);
  const [createFieldError, setCreateFieldError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles/${profileId}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(readApiError(payload, 'Failed to load profile')); return; }
      setProfile(readApiData<OutputProfile>(payload, null as unknown as OutputProfile));
    } catch { setError('Failed to load profile'); }
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

  const existingCodes = useMemo(() => new Set(profile?.field_rules.map((r) => r.field_code) ?? []), [profile]);

  // All fields not yet in the profile, grouped
  const availableGroups = useMemo(() =>
    fieldGroups.map((g) => ({
      ...g,
      product_fields: g.product_fields.filter((f) => !existingCodes.has(f.code)),
    })).filter((g) => g.product_fields.length > 0),
  [fieldGroups, existingCodes]);

  const filteredGroups = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    return availableGroups
      .filter((g) => selectedGroupFilter === 'all' || g.code === selectedGroupFilter)
      .map((g) => ({
        ...g,
        product_fields: q
          ? g.product_fields.filter((f) => f.name.toLowerCase().includes(q) || f.code.includes(q))
          : g.product_fields,
      }))
      .filter((g) => g.product_fields.length > 0);
  }, [availableGroups, fieldSearch, selectedGroupFilter]);

  const totalAvailable = useMemo(() => availableGroups.reduce((n, g) => n + g.product_fields.length, 0), [availableGroups]);

  const toggleField = (code: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const toggleGroupAll = (group: FieldGroup) => {
    const groupCodes = group.product_fields.map((f) => f.code);
    const allChecked = groupCodes.every((c) => checked.has(c));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) { groupCodes.forEach((c) => next.delete(c)); }
      else { groupCodes.forEach((c) => next.add(c)); }
      return next;
    });
  };

  const selectAll = () => {
    const allCodes = filteredGroups.flatMap((g) => g.product_fields.map((f) => f.code));
    setChecked((prev) => { const next = new Set(prev); allCodes.forEach((c) => next.add(c)); return next; });
  };

  const clearAll = () => setChecked(new Set());

  const goToConfigure = () => {
    const allFields = availableGroups.flatMap((g) => g.product_fields);
    const fieldMap = new Map(allFields.map((f) => [f.code, f]));
    const configs: BulkFieldConfig[] = Array.from(checked)
      .map((code) => fieldMap.get(code))
      .filter((f): f is AvailableField => !!f)
      .map((f) => ({ field: f, is_required: true, max_length: '', notes: '' }));
    setBulkConfigs(configs);
    setAddStep('configure');
  };

  const handleBulkAdd = async () => {
    setSaving(true);
    setSaveError(null);

    const rules = bulkConfigs.map((c) => ({
      field_code: c.field.code,
      is_required: c.is_required,
      max_length: c.max_length.trim() ? parseInt(c.max_length, 10) : null,
      notes: c.notes.trim() || null,
    }));

    // Optimistic update
    const optimisticRules: FieldRule[] = rules.map((r, i) => ({
      id: `optimistic-${Date.now()}-${i}`,
      field_code: r.field_code,
      is_required: r.is_required,
      max_length: r.max_length && r.max_length > 0 ? r.max_length : null,
      notes: r.notes,
    }));

    setProfile((prev) => prev ? { ...prev, field_rules: [...prev.field_rules, ...optimisticRules] } : prev);
    setAddStep('none');
    setChecked(new Set());
    setBulkConfigs([]);
    setFieldSearch('');

    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles/${profileId}/field-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Roll back
        const optimisticIds = new Set(optimisticRules.map((r) => r.id));
        setProfile((prev) => prev ? { ...prev, field_rules: prev.field_rules.filter((r) => !optimisticIds.has(r.id)) } : prev);
        setSaveError(readApiError(payload, 'Failed to save fields'));
        return;
      }
      // Refresh to get real IDs
      await fetchProfile();
    } catch {
      const optimisticIds = new Set(optimisticRules.map((r) => r.id));
      setProfile((prev) => prev ? { ...prev, field_rules: prev.field_rules.filter((r) => !optimisticIds.has(r.id)) } : prev);
      setSaveError('Failed to save fields');
    } finally {
      setSaving(false);
    }
  };

  const handleInlineSave = async (
    ruleCode: string,
    updates: { is_required: boolean; max_length: number | null; notes: string | null }
  ) => {
    setProfile((prev) =>
      prev ? { ...prev, field_rules: prev.field_rules.map((r) => r.field_code === ruleCode ? { ...r, ...updates } : r) } : prev
    );
    setEditingRuleCode(null);
    try {
      await fetch(`/api/${tenantSlug}/output-profiles/${profileId}/field-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_code: ruleCode, ...updates }),
      });
    } catch { /* silent — UI already reflects the change */ }
  };

  const handleDeleteRule = async () => {
    if (!deleteRuleCode) return;
    setDeletingRule(true);
    try {
      await fetch(`/api/${tenantSlug}/output-profiles/${profileId}/field-rules?field_code=${encodeURIComponent(deleteRuleCode)}`, { method: 'DELETE' });
      setDeleteRuleCode(null);
      await fetchProfile();
    } catch { /* silent */ }
    finally { setDeletingRule(false); }
  };

  const handleScaffold = async (templateKey: string) => {
    setScaffoldingKey(templateKey);
    setScaffoldError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles/${profileId}/scaffold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_key: templateKey }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScaffoldError(payload.error ?? 'Failed to scaffold fields');
        return;
      }
      setScaffoldOpen(false);
      await Promise.all([fetchProfile(), fetchFieldGroups()]);
    } catch {
      setScaffoldError('Failed to scaffold fields');
    } finally {
      setScaffoldingKey(null);
    }
  };

  const handleCreateField = async () => {
    const name = createFieldName.trim();
    if (!name || !createFieldType) return;
    setCreatingField(true);
    setCreateFieldError(null);
    try {
      const fieldRes = await fetch(`/api/${tenantSlug}/product-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, field_type: createFieldType, is_localizable: false }),
      });
      const fieldPayload = await fieldRes.json().catch(() => ({}));
      if (!fieldRes.ok) {
        setCreateFieldError(fieldPayload.error ?? 'Failed to create field');
        return;
      }
      const newField = fieldPayload.data as AvailableField;
      if (createFieldGroupCode) {
        await fetch(`/api/${tenantSlug}/field-groups/${encodeURIComponent(createFieldGroupCode)}/fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_field_id: newField.id }),
        });
      }
      setChecked((prev) => new Set([...prev, newField.code]));
      await fetchFieldGroups();
      setCreateFieldOpen(false);
      setCreateFieldName('');
      setCreateFieldType('text');
      setCreateFieldGroupCode('');
    } catch {
      setCreateFieldError('Failed to create field');
    } finally {
      setCreatingField(false);
    }
  };

  const handleToggleActive = async (next: boolean) => {
    if (!profile) return;
    setTogglingActive(true);
    setProfile((prev) => prev ? { ...prev, is_active: next } : prev);
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles/${profileId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) setProfile((prev) => prev ? { ...prev, is_active: !next } : prev);
    } catch { setProfile((prev) => prev ? { ...prev, is_active: !next } : prev); }
    finally { setTogglingActive(false); }
  };

  const handleTogglePrimary = async (next: boolean) => {
    if (!profile) return;
    setTogglingPrimary(true);
    setProfile((prev) => prev ? { ...prev, is_primary: next } : prev);
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles/${profileId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: next }),
      });
      if (!res.ok) setProfile((prev) => prev ? { ...prev, is_primary: !next } : prev);
    } catch { setProfile((prev) => prev ? { ...prev, is_primary: !next } : prev); }
    finally { setTogglingPrimary(false); }
  };

  const backLink = (
    <Link href={`/${tenantSlug}/settings/output-profiles`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ChevronLeft className="h-4 w-4" /><span>Channels</span>
    </Link>
  );

  if (loading) return <div className="h-full bg-background"><PageSkeleton text="Loading profile..." size="lg" /></div>;
  if (error || !profile) return (
    <SettingsSecondLevelPage page="output-profile-detail" backLink={backLink}>
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error ?? 'Profile not found'}</div>
    </SettingsSecondLevelPage>
  );

  const requiredRules = profile.field_rules.filter((r) => r.is_required);
  const optionalRules = profile.field_rules.filter((r) => !r.is_required);
  const allFields = fieldGroups.flatMap((g) => g.product_fields);
  const fieldMap = new Map(allFields.map((f) => [f.code, f]));

  return (
    <SettingsSecondLevelPage page="output-profile-detail" backLink={backLink}>

      {/* Profile header */}
      <div className="rounded-lg border border-border/60 bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
              {PROFILE_TYPE_ICONS[profile.profile_type] ?? <Zap className="h-4 w-4" />}
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">{profile.name}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-muted-foreground">{PROFILE_TYPE_LABELS[profile.profile_type] ?? profile.profile_type}</span>
                <span className="text-muted-foreground/40">·</span>
                <code className="text-xs text-muted-foreground font-mono">{profile.code}</code>
                {profile.market && (<><span className="text-muted-foreground/40">·</span><span className="text-xs text-muted-foreground">{profile.market.name}</span></>)}
              </div>
              {profile.description && <p className="text-xs text-muted-foreground mt-1">{profile.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground" title="Mark as the default profile for the product list readiness column">Primary</span>
              <Switch checked={profile.is_primary} onCheckedChange={handleTogglePrimary} disabled={togglingPrimary} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Active</span>
              <Switch checked={profile.is_active} onCheckedChange={handleToggleActive} disabled={togglingActive} />
            </div>
          </div>
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: profile.field_rules.length, label: 'Total fields' },
          { value: requiredRules.length, label: 'Required' },
          { value: optionalRules.length, label: 'Optional', muted: true },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 bg-card p-3 text-center">
            <div className={`text-2xl font-bold ${s.muted ? 'text-muted-foreground' : ''}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Field Requirements */}
      <div className="rounded-lg border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Field Requirements</h2>
          {addStep === 'none' && !scaffoldOpen && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setScaffoldOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Use template
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setAddStep('select')} disabled={totalAvailable === 0}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add fields
              </Button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{saveError}</div>
        )}

        {/* ── Template picker ── */}
        {scaffoldOpen && (() => {
          const matchingTemplates = OUTPUT_PROFILE_TEMPLATES.filter((t) => t.profile_type === profile.profile_type);
          const otherTemplates = OUTPUT_PROFILE_TEMPLATES.filter((t) => t.profile_type !== profile.profile_type);

          const TemplateRow = ({ tmpl }: { tmpl: typeof OUTPUT_PROFILE_TEMPLATES[number] }) => (
            <div className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{tmpl.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tmpl.description}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {tmpl.fields.length} fields · {tmpl.field_rules.length} rules
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs shrink-0"
                disabled={scaffoldingKey !== null}
                onClick={() => void handleScaffold(tmpl.key)}
              >
                {scaffoldingKey === tmpl.key ? 'Scaffolding…' : 'Use this'}
              </Button>
            </div>
          );

          return (
            <div className="rounded-lg border border-gray-200 bg-muted/10 overflow-hidden">
              <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Choose a template</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Creates a field group and pre-fills field requirements.</p>
                </div>
                <button onClick={() => { setScaffoldOpen(false); setScaffoldError(null); setOtherTemplatesOpen(false); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </div>

              <div className="divide-y divide-gray-200">
                {matchingTemplates.map((tmpl) => <TemplateRow key={tmpl.key} tmpl={tmpl} />)}
              </div>

              {otherTemplates.length > 0 && (
                <div className="border-t border-gray-200">
                  <button
                    onClick={() => setOtherTemplatesOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Other templates</span>
                    {otherTemplatesOpen
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRightIcon className="h-3.5 w-3.5" />}
                  </button>
                  {otherTemplatesOpen && (
                    <div className="divide-y divide-gray-200 border-t border-gray-200">
                      {otherTemplates.map((tmpl) => <TemplateRow key={tmpl.key} tmpl={tmpl} />)}
                    </div>
                  )}
                </div>
              )}

              {scaffoldError && (
                <div className="border-t border-gray-200 px-4 py-2 text-xs text-destructive bg-destructive/5">{scaffoldError}</div>
              )}
            </div>
          );
        })()}

        {/* ── Step 1: Select fields ── */}
        {addStep === 'select' && (
          <div className="rounded-lg border border-gray-200 bg-muted/10 overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Select fields to add</p>
                <div className="flex items-center gap-3 text-xs">
                  <button onClick={selectAll} className="text-muted-foreground hover:text-foreground transition-colors">Select all</button>
                  <button onClick={clearAll} className="text-muted-foreground hover:text-foreground transition-colors">Clear</button>
                  <span className="text-muted-foreground">{checked.size} selected</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Search fields..." value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} className="h-8 pl-8 text-sm" autoFocus />
                </div>
                <select
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="all">All groups</option>
                  {availableGroups.map((g) => (
                    <option key={g.code} value={g.code}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-gray-200">
              {filteredGroups.map((group) => {
                const groupCodes = group.product_fields.map((f) => f.code);
                const allGroupChecked = groupCodes.every((c) => checked.has(c));
                const someGroupChecked = groupCodes.some((c) => checked.has(c));
                const isCollapsed = collapsedGroups.has(group.code);

                return (
                  <div key={group.code}>
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 sticky top-0">
                      <input
                        type="checkbox"
                        checked={allGroupChecked}
                        ref={(el) => { if (el) el.indeterminate = someGroupChecked && !allGroupChecked; }}
                        onChange={() => toggleGroupAll(group)}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                      <button
                        onClick={() => setCollapsedGroups((prev) => { const next = new Set(prev); if (next.has(group.code)) next.delete(group.code); else next.add(group.code); return next; })}
                        className="flex flex-1 items-center gap-1 text-left"
                      >
                        {isCollapsed ? <ChevronRightIcon className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">({group.product_fields.length})</span>
                      </button>
                    </div>

                    {/* Fields in group */}
                    {!isCollapsed && group.product_fields.map((field) => (
                      <label key={field.code} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked.has(field.code)}
                          onChange={() => toggleField(field.code)}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        <span className="flex-1 text-sm text-foreground">{field.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{field.code}</span>
                        <span className="text-[10px] text-muted-foreground w-16 text-right">{FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}</span>
                      </label>
                    ))}
                  </div>
                );
              })}

              {filteredGroups.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {fieldSearch ? 'No matching fields.' : 'All fields have already been added.'}
                </div>
              )}
            </div>

            {/* Inline field creation form */}
            {createFieldOpen && (
              <div className="border-t border-gray-200 px-4 py-3 bg-muted/20 space-y-3">
                <p className="text-xs font-medium">Create new field</p>
                <p className="text-[11px] text-muted-foreground">This field will be available on all products in your org.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input
                      placeholder="e.g. Sell Sheet"
                      value={createFieldName}
                      onChange={(e) => setCreateFieldName(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                      disabled={creatingField}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <Select value={createFieldType} onValueChange={setCreateFieldType} disabled={creatingField}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="textarea">Textarea</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="select">Select</SelectItem>
                        <SelectItem value="file">File / Asset</SelectItem>
                        <SelectItem value="measurement">Measurement</SelectItem>
                        <SelectItem value="table">Table</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Add to group <span className="font-normal">(optional)</span></label>
                  <Select value={createFieldGroupCode} onValueChange={setCreateFieldGroupCode} disabled={creatingField}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Choose a group…" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldGroups.map((g) => (
                        <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {createFieldError && <p className="text-xs text-destructive">{createFieldError}</p>}
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-7 px-3 text-xs" disabled={!createFieldName.trim() || creatingField} onClick={() => void handleCreateField()}>
                    {creatingField ? 'Creating…' : 'Create & select'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => { setCreateFieldOpen(false); setCreateFieldName(''); setCreateFieldError(null); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-background">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => { setAddStep('none'); setChecked(new Set()); setFieldSearch(''); setCreateFieldOpen(false); }}>
                  Cancel
                </Button>
                {!createFieldOpen && (
                  <button
                    onClick={() => setCreateFieldOpen(true)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Create new field
                  </button>
                )}
              </div>
              <Button size="sm" className="h-7 px-3 text-xs" disabled={checked.size === 0} onClick={goToConfigure}>
                Configure {checked.size > 0 ? `${checked.size} field${checked.size === 1 ? '' : 's'}` : 'selected'}
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Configure selected fields ── */}
        {addStep === 'configure' && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between bg-muted/10">
              <div>
                <p className="text-sm font-medium">Configure {bulkConfigs.length} field{bulkConfigs.length === 1 ? '' : 's'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Set required/optional, max length, and notes for each. Defaults to Required.</p>
              </div>
              <button onClick={() => setAddStep('select')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" />Back
              </button>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_80px_1fr] gap-3 px-4 py-2 bg-muted/30 border-b border-gray-200">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Field</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Required</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Max length</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
            </div>

            <div className="divide-y divide-gray-200 max-h-72 overflow-y-auto">
              {bulkConfigs.map((config, i) => (
                <div key={config.field.code} className="grid grid-cols-[1fr_100px_80px_1fr] gap-3 items-center px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{config.field.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{config.field.code}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.is_required}
                      onCheckedChange={(v) => setBulkConfigs((prev) => prev.map((c, j) => j === i ? { ...c, is_required: v } : c))}
                    />
                    <span className="text-xs text-muted-foreground">{config.is_required ? 'Yes' : 'No'}</span>
                  </div>
                  <Input
                    placeholder="—"
                    value={config.max_length}
                    onChange={(e) => setBulkConfigs((prev) => prev.map((c, j) => j === i ? { ...c, max_length: e.target.value } : c))}
                    type="number"
                    min={1}
                    className="h-7 text-xs px-2"
                  />
                  <Input
                    placeholder="Optional guidance..."
                    value={config.notes}
                    onChange={(e) => setBulkConfigs((prev) => prev.map((c, j) => j === i ? { ...c, notes: e.target.value } : c))}
                    className="h-7 text-xs"
                  />
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-background">
              <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => { setAddStep('none'); setChecked(new Set()); setBulkConfigs([]); }}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 px-3 text-xs" disabled={saving} onClick={() => void handleBulkAdd()}>
                {saving ? 'Adding...' : `Add ${bulkConfigs.length} field${bulkConfigs.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Existing rules list ── */}
        {profile.field_rules.length === 0 && addStep === 'none' && !scaffoldOpen ? (
          <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border rounded-lg">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No field requirements yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Start with a template to scaffold the field group and rules automatically, or add fields manually.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <Button size="sm" variant="default" className="h-7 px-3 text-xs" onClick={() => setScaffoldOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Use template
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={() => setAddStep('select')} disabled={totalAvailable === 0}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add fields manually
              </Button>
            </div>
          </div>
        ) : profile.field_rules.length > 0 ? (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
            {profile.field_rules
              .slice()
              .sort((a, b) => {
                if (a.is_required !== b.is_required) return a.is_required ? -1 : 1;
                return a.field_code.localeCompare(b.field_code);
              })
              .map((rule) => {
                const fieldDef = fieldMap.get(rule.field_code);
                const isOptimistic = rule.id.startsWith('optimistic-');
                const isEditing = editingRuleCode === rule.field_code;

                return (
                  <div key={rule.id} className={isOptimistic ? 'opacity-50' : ''}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => !isOptimistic && setEditingRuleCode(isEditing ? null : rule.field_code)}
                    >
                      {rule.is_required ? (
                        <CheckCircle2 className="h-4 w-4 text-foreground shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{fieldDef?.name ?? rule.field_code}</span>
                          <code className="font-mono text-xs text-muted-foreground">{rule.field_code}</code>
                          {rule.is_required && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">required</Badge>}
                          {rule.max_length ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">max {rule.max_length}</Badge> : null}
                          {fieldDef ? <span className="text-[10px] text-muted-foreground">{FIELD_TYPE_LABELS[fieldDef.field_type] ?? fieldDef.field_type}</span> : null}
                        </div>
                        {rule.notes ? <p className="text-xs text-muted-foreground mt-0.5">{rule.notes}</p> : null}
                      </div>
                      {!isOptimistic && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteRuleCode(rule.field_code); }}
                          className="text-muted-foreground/50 hover:text-destructive transition-colors p-1 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {isEditing && (
                      <InlineRuleEditor
                        rule={rule}
                        fieldName={fieldDef?.name ?? rule.field_code}
                        onSave={(updates) => void handleInlineSave(rule.field_code, updates)}
                        onCancel={() => setEditingRuleCode(null)}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        ) : null}
      </div>

      <DeleteConfirmDialog
        open={!!deleteRuleCode}
        onOpenChange={(open) => { if (!open) setDeleteRuleCode(null); }}
        title={`Remove "${fieldMap.get(deleteRuleCode ?? '')?.name ?? deleteRuleCode}"`}
        description="This field requirement will be removed from the profile. Products will no longer be scored against it."
        onConfirm={handleDeleteRule}
        confirmLoading={deletingRule}
      />
    </SettingsSecondLevelPage>
  );
}
