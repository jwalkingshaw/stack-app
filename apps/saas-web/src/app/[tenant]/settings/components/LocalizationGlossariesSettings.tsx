'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ItemList } from '@/components/ui/item-list';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SettingsContentBoundary, SettingsSecondLevelPage } from './settings-page-content';

interface LocalizationGlossariesSettingsProps {
  tenantSlug: string;
}

interface LocaleOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface GlossarySummary {
  id: string;
  name: string;
  source_language_code: string;
  target_language_code: string;
  provider_glossary_id: string | null;
  is_active: boolean;
  entry_count: number;
  updated_at: string;
}

interface GlossaryEntry {
  id: string;
  source_term: string;
  target_term: string;
  notes: string | null;
}

interface GlossariesResponse {
  success: boolean;
  data: {
    glossaries: GlossarySummary[];
  };
}

interface GlossaryEntriesResponse {
  success: boolean;
  data: {
    entries: GlossaryEntry[];
  };
}

type ViewMode = 'list' | 'create' | 'detail';

interface ParsedGlossaryEntry {
  sourceTerm: string;
  targetTerm: string;
  notes?: string;
}

interface GlossaryEntryDraft {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  notes: string;
}

function createEntryDraft(partial?: Partial<GlossaryEntryDraft>): GlossaryEntryDraft {
  const randomId = Math.random().toString(36).slice(2, 10);
  return {
    id: partial?.id || `entry_${Date.now()}_${randomId}`,
    sourceTerm: partial?.sourceTerm || '',
    targetTerm: partial?.targetTerm || '',
    notes: partial?.notes || '',
  };
}

function normalizeEntryDraftsToPayload(entries: GlossaryEntryDraft[]): ParsedGlossaryEntry[] {
  return entries
    .map((entry) => ({
      sourceTerm: entry.sourceTerm.trim(),
      targetTerm: entry.targetTerm.trim(),
      notes: entry.notes.trim() || undefined,
    }))
    .filter((entry) => entry.sourceTerm.length > 0 && entry.targetTerm.length > 0);
}

function hasIncompleteEntryRows(entries: GlossaryEntryDraft[]): boolean {
  return entries.some((entry) => {
    const sourceTerm = entry.sourceTerm.trim();
    const targetTerm = entry.targetTerm.trim();
    const hasEither = sourceTerm.length > 0 || targetTerm.length > 0;
    const hasBoth = sourceTerm.length > 0 && targetTerm.length > 0;
    return hasEither && !hasBoth;
  });
}

function toEntryDrafts(entries: GlossaryEntry[]): GlossaryEntryDraft[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [createEntryDraft()];
  }
  return entries.map((entry) =>
    createEntryDraft({
      id: entry.id,
      sourceTerm: entry.source_term || '',
      targetTerm: entry.target_term || '',
      notes: entry.notes || '',
    })
  );
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

export default function LocalizationGlossariesSettings({ tenantSlug }: LocalizationGlossariesSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(null);

  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [glossaries, setGlossaries] = useState<GlossarySummary[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [localesLoading, setLocalesLoading] = useState(true);

  const [createName, setCreateName] = useState('');
  const [createSourceLocaleId, setCreateSourceLocaleId] = useState('');
  const [createTargetLocaleId, setCreateTargetLocaleId] = useState('');
  const [createEntries, setCreateEntries] = useState<GlossaryEntryDraft[]>([createEntryDraft()]);

  const [detailName, setDetailName] = useState('');
  const [detailIsActive, setDetailIsActive] = useState(true);
  const [detailEntries, setDetailEntries] = useState<GlossaryEntryDraft[]>([createEntryDraft()]);

  const fetchGlossaries = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/localization/glossaries`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load glossaries');
    }
    const payload = (await response.json()) as GlossariesResponse;
    setGlossaries(payload.data.glossaries || []);
  }, [tenantSlug]);

  const fetchLocales = useCallback(async () => {
    setLocalesLoading(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/locales`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load locales');
      }
      const payload = await response.json().catch(() => []);
      setLocales(Array.isArray(payload) ? payload.filter((locale) => locale?.is_active) : []);
    } finally {
      setLocalesLoading(false);
    }
  }, [tenantSlug]);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await fetchGlossaries();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load glossary data');
    } finally {
      setLoading(false);
    }

    void fetchLocales().catch((localeError) => {
      setError((current) => current || (localeError instanceof Error ? localeError.message : 'Failed to load locales'));
    });
  }, [fetchGlossaries, fetchLocales]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const localeLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    locales.forEach((locale) => {
      map.set(normalizeCode(locale.code), `${locale.name} (${locale.code})`);
    });
    return map;
  }, [locales]);

  const glossaryById = useMemo(() => {
    const map = new Map<string, GlossarySummary>();
    glossaries.forEach((glossary) => map.set(glossary.id, glossary));
    return map;
  }, [glossaries]);

  const selectedGlossary = selectedGlossaryId ? glossaryById.get(selectedGlossaryId) || null : null;

  const filteredGlossaries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return glossaries;

    return glossaries.filter((glossary) => {
      const label = `${glossary.name} ${glossary.source_language_code} ${glossary.target_language_code}`.toLowerCase();
      return label.includes(query);
    });
  }, [glossaries, searchQuery]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateSourceLocaleId('');
    setCreateTargetLocaleId('');
    setCreateEntries([createEntryDraft()]);
  };

  const updateCreateEntry = (id: string, field: keyof Omit<GlossaryEntryDraft, 'id'>, value: string) => {
    setCreateEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };

  const addCreateEntry = () => {
    setCreateEntries((prev) => [...prev, createEntryDraft()]);
  };

  const removeCreateEntry = (id: string) => {
    setCreateEntries((prev) => {
      if (prev.length <= 1) {
        return [createEntryDraft()];
      }
      return prev.filter((entry) => entry.id !== id);
    });
  };

  const updateDetailEntry = (id: string, field: keyof Omit<GlossaryEntryDraft, 'id'>, value: string) => {
    setDetailEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };

  const addDetailEntry = () => {
    setDetailEntries((prev) => [...prev, createEntryDraft()]);
  };

  const removeDetailEntry = (id: string) => {
    setDetailEntries((prev) => {
      if (prev.length <= 1) {
        return [createEntryDraft()];
      }
      return prev.filter((entry) => entry.id !== id);
    });
  };

  const openListView = () => {
    setViewMode('list');
    setSelectedGlossaryId(null);
    setError(null);
  };

  const openCreateView = () => {
    setError(null);
    setSaveNotice(null);
    resetCreateForm();
    setViewMode('create');
    if (!localesLoading && locales.length === 0) {
      void fetchLocales().catch((localeError) => {
        setError(localeError instanceof Error ? localeError.message : 'Failed to load locales');
      });
    }
  };

  const loadGlossaryDetail = useCallback(async (glossary: GlossarySummary) => {
    try {
      setLoadingEntries(true);
      setError(null);

      setSelectedGlossaryId(glossary.id);
      setDetailName(glossary.name);
      setDetailIsActive(glossary.is_active);
      setDetailEntries([createEntryDraft()]);
      setViewMode('detail');

      const response = await fetch(`/api/${tenantSlug}/localization/glossaries/${glossary.id}/entries`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load glossary entries');
      }

      const payload = (await response.json()) as GlossaryEntriesResponse;
      setDetailEntries(toEntryDrafts(payload.data.entries || []));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Failed to load glossary details');
    } finally {
      setLoadingEntries(false);
    }
  }, [tenantSlug]);

  const handleCreateGlossary = async () => {
    const name = createName.trim();
    const sourceLocaleId = createSourceLocaleId.trim();
    const targetLocaleId = createTargetLocaleId.trim();
    const entries = normalizeEntryDraftsToPayload(createEntries);

    if (!name) {
      setError('Glossary name is required.');
      return;
    }
    if (!sourceLocaleId || !targetLocaleId) {
      setError('Select both source and target locale.');
      return;
    }
    if (sourceLocaleId === targetLocaleId) {
      setError('Source and target locale must be different.');
      return;
    }
    if (hasIncompleteEntryRows(createEntries)) {
      setError('Each glossary row must include both source and target term.');
      return;
    }
    if (entries.length === 0) {
      setError('Add at least one glossary term pair.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSaveNotice(null);

      const response = await fetch(`/api/${tenantSlug}/localization/glossaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sourceLocaleId,
          targetLocaleId,
          entries,
          createProviderGlossary: true,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to create glossary');
      }

      const payload = (await response.json()) as {
        success: boolean;
        data: { glossary: GlossarySummary };
      };

      await fetchGlossaries();
      setSaveNotice('Glossary created.');
      if (payload?.data?.glossary) {
        await loadGlossaryDetail(payload.data.glossary);
      } else {
        openListView();
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create glossary');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveGlossary = async () => {
    if (!selectedGlossary) return;

    const name = detailName.trim();
    const entries = normalizeEntryDraftsToPayload(detailEntries);

    if (!name) {
      setError('Glossary name is required.');
      return;
    }
    if (hasIncompleteEntryRows(detailEntries)) {
      setError('Each glossary row must include both source and target term.');
      return;
    }
    if (entries.length === 0) {
      setError('Add at least one glossary term pair.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSaveNotice(null);

      const patchResponse = await fetch(`/api/${tenantSlug}/localization/glossaries/${selectedGlossary.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          isActive: detailIsActive,
        }),
      });

      if (!patchResponse.ok) {
        const payload = await patchResponse.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to update glossary');
      }

      const entriesResponse = await fetch(`/api/${tenantSlug}/localization/glossaries/${selectedGlossary.id}/entries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });

      if (!entriesResponse.ok) {
        const payload = await entriesResponse.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to update glossary entries');
      }

      await fetchGlossaries();
      setSaveNotice('Glossary saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save glossary');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGlossary = async () => {
    if (!selectedGlossary) return;

    try {
      setSubmitting(true);
      setError(null);
      setSaveNotice(null);

      const response = await fetch(`/api/${tenantSlug}/localization/glossaries/${selectedGlossary.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to delete glossary');
      }

      await fetchGlossaries();
      setSaveNotice('Glossary deleted.');
      openListView();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete glossary');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading glossaries..." size="lg" variant="settings-detail" />
      </div>
    );
  }

  const detailSourceLabel = selectedGlossary
    ? localeLabelByCode.get(normalizeCode(selectedGlossary.source_language_code)) ||
      selectedGlossary.source_language_code
    : '';
  const detailTargetLabel = selectedGlossary
    ? localeLabelByCode.get(normalizeCode(selectedGlossary.target_language_code)) ||
      selectedGlossary.target_language_code
    : '';

  return (
    <SettingsSecondLevelPage
      page="localization"
      backLink={(
        <Link
          href={`/${tenantSlug}/settings/localization`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Localization</span>
        </Link>
      )}
    >
      <SettingsContentBoundary size="md" className="space-y-6">
        {viewMode !== 'list' ? (
          <button
            type="button"
            onClick={openListView}
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Glossaries</span>
          </button>
        ) : null}

        <div>
          <h2 className="text-2xl font-semibold text-foreground">Glossaries</h2>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {saveNotice ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {saveNotice}
          </div>
        ) : null}

        {viewMode === 'list' ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search glossaries..."
                className="pl-9"
              />
            </div>

            <ItemList
              items={filteredGlossaries}
              getKey={(glossary) => glossary.id}
              renderTitle={(glossary) => glossary.name}
              renderSubtitle={(glossary) => {
                const source = localeLabelByCode.get(normalizeCode(glossary.source_language_code)) || glossary.source_language_code;
                const target = localeLabelByCode.get(normalizeCode(glossary.target_language_code)) || glossary.target_language_code;
                return `${source} -> ${target}`;
              }}
              renderRight={(glossary) => (
                <div className="flex items-center gap-2">
                  <Badge variant={glossary.is_active ? 'success' : 'neutral'}>
                    {glossary.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="secondary">
                    {glossary.entry_count} {glossary.entry_count === 1 ? 'term' : 'terms'}
                  </Badge>
                </div>
              )}
              onClickItem={(glossary) => {
                void loadGlossaryDetail(glossary);
              }}
              loading={false}
              loadingRows={6}
              emptyMessage={searchQuery.trim() ? 'No glossaries match your search.' : 'No glossaries yet.'}
              headerLabel="glossaries"
              onCreate={openCreateView}
              createLabel="Add glossary"
            />
          </>
        ) : null}

        {viewMode === 'create' ? (
          <Card>
          <CardHeader>
            <CardTitle>Create Glossary</CardTitle>
            <CardDescription>
              Add source and target terms for one language pair.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="text-sm font-medium">Glossary Name</div>
              <Input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Sports Nutrition Core Terms"
                disabled={submitting}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Source Language</div>
                <Select value={createSourceLocaleId || '__none__'} onValueChange={(value) => setCreateSourceLocaleId(value === '__none__' ? '' : value)}>
                  <SelectTrigger disabled={submitting || localesLoading}>
                    <SelectValue placeholder={localesLoading ? 'Loading languages...' : 'Select source language'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select...</SelectItem>
                    {locales.map((locale) => (
                      <SelectItem key={locale.id} value={locale.id}>
                        {locale.name} ({locale.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Target Language</div>
                <Select value={createTargetLocaleId || '__none__'} onValueChange={(value) => setCreateTargetLocaleId(value === '__none__' ? '' : value)}>
                  <SelectTrigger disabled={submitting || localesLoading}>
                    <SelectValue placeholder={localesLoading ? 'Loading languages...' : 'Select target language'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select...</SelectItem>
                    {locales
                      .filter((locale) => locale.id !== createSourceLocaleId)
                      .map((locale) => (
                        <SelectItem key={locale.id} value={locale.id}>
                          {locale.name} ({locale.code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Glossary Terms</div>
              <div className="space-y-2">
                {createEntries.map((entry, index) => (
                  <div key={entry.id} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <Input
                      value={entry.sourceTerm}
                      onChange={(event) => updateCreateEntry(entry.id, 'sourceTerm', event.target.value)}
                      placeholder={index === 0 ? 'Source term (e.g. creatine monohydrate)' : 'Source term'}
                      disabled={submitting}
                    />
                    <Input
                      value={entry.targetTerm}
                      onChange={(event) => updateCreateEntry(entry.id, 'targetTerm', event.target.value)}
                      placeholder={index === 0 ? 'Target term (e.g. creatina monohidrato)' : 'Target term'}
                      disabled={submitting}
                    />
                    <Input
                      value={entry.notes}
                      onChange={(event) => updateCreateEntry(entry.id, 'notes', event.target.value)}
                      placeholder="Notes (optional)"
                      disabled={submitting}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeCreateEntry(entry.id)}
                      disabled={submitting || createEntries.length <= 1}
                      aria-label="Remove glossary row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Add one term pair per row.
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addCreateEntry} disabled={submitting}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add row
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button onClick={handleCreateGlossary} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Glossary'}
              </Button>
            </div>
          </CardContent>
          </Card>
        ) : null}

        {viewMode === 'detail' && selectedGlossary ? (
          <Card>
          <CardHeader>
            <CardTitle>Manage Glossary</CardTitle>
            <CardDescription>
              Update glossary terms and activation for this language pair.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingEntries ? (
              <div className="rounded-md border border-border/60 px-4 py-3 text-sm text-muted-foreground">
                Loading glossary entries...
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">Glossary Name</div>
              <Input
                value={detailName}
                onChange={(event) => setDetailName(event.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Source Language</div>
                <div className="rounded-md border border-border/60 px-3 py-2 text-sm text-foreground">
                  {detailSourceLabel}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Target Language</div>
                <div className="rounded-md border border-border/60 px-3 py-2 text-sm text-foreground">
                  {detailTargetLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">Glossary Active</div>
                <div className="text-xs text-muted-foreground">Inactive glossaries are excluded from normal use.</div>
              </div>
              <Switch
                checked={detailIsActive}
                onCheckedChange={(checked) => setDetailIsActive(Boolean(checked))}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Glossary Terms</div>
              <div className="space-y-2">
                {detailEntries.map((entry, index) => (
                  <div key={entry.id} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <Input
                      value={entry.sourceTerm}
                      onChange={(event) => updateDetailEntry(entry.id, 'sourceTerm', event.target.value)}
                      placeholder={index === 0 ? 'Source term (e.g. creatine monohydrate)' : 'Source term'}
                      disabled={submitting || loadingEntries}
                    />
                    <Input
                      value={entry.targetTerm}
                      onChange={(event) => updateDetailEntry(entry.id, 'targetTerm', event.target.value)}
                      placeholder={index === 0 ? 'Target term (e.g. creatina monohidrato)' : 'Target term'}
                      disabled={submitting || loadingEntries}
                    />
                    <Input
                      value={entry.notes}
                      onChange={(event) => updateDetailEntry(entry.id, 'notes', event.target.value)}
                      placeholder="Notes (optional)"
                      disabled={submitting || loadingEntries}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeDetailEntry(entry.id)}
                      disabled={submitting || loadingEntries || detailEntries.length <= 1}
                      aria-label="Remove glossary row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Add one term pair per row.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDetailEntry}
                  disabled={submitting || loadingEntries}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add row
                </Button>
              </div>
            </div>

            <div className="flex justify-between gap-3">
              <Button
                variant="destructive"
                onClick={() => {
                  void handleDeleteGlossary();
                }}
                disabled={submitting || loadingEntries}
              >
                {submitting ? 'Deleting...' : 'Delete Glossary'}
              </Button>
              <Button
                onClick={() => {
                  void handleSaveGlossary();
                }}
                disabled={submitting || loadingEntries}
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
          </Card>
        ) : null}
      </SettingsContentBoundary>
    </SettingsSecondLevelPage>
  );
}

