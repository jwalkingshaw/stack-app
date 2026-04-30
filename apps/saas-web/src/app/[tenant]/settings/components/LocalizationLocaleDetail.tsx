'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { SettingsSecondLevelPage } from './settings-page-content';

interface LocalizationLocaleDetailProps {
  tenantSlug: string;
  localeId: string;
}

interface ManagedLocaleOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  display_name?: string;
  is_default?: boolean;
  market_count?: number;
  field_value_count?: number;
  glossary_count?: number;
  job_count?: number;
}

interface LocaleOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface LocalizationSettingsData {
  default_locale_id?: string | null;
  brand_instructions: string;
  preferred_tone: 'neutral' | 'formal' | 'informal' | 'professional' | 'friendly';
}

interface GlossarySummary {
  id: string;
  name: string;
  source_language_code: string;
  target_language_code: string;
  provider_glossary_id: string | null;
  is_active: boolean;
  entry_count: number;
}

interface GlossaryEntry {
  id: string;
  source_term: string;
  target_term: string;
  notes: string | null;
}

interface GlossaryEntryDraft {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  notes: string;
}

function localeDisplayName(locale: Pick<ManagedLocaleOption, 'display_name' | 'name'>): string {
  return locale.display_name || locale.name;
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

function toEntryDrafts(entries: GlossaryEntry[]): GlossaryEntryDraft[] {
  if (!Array.isArray(entries) || entries.length === 0) return [createEntryDraft()];
  return entries.map((entry) =>
    createEntryDraft({
      id: entry.id,
      sourceTerm: entry.source_term || '',
      targetTerm: entry.target_term || '',
      notes: entry.notes || '',
    })
  );
}

function normalizeEntries(entries: GlossaryEntryDraft[]) {
  return entries
    .map((entry) => ({
      sourceTerm: entry.sourceTerm.trim(),
      targetTerm: entry.targetTerm.trim(),
      notes: entry.notes.trim() || undefined,
    }))
    .filter((entry) => entry.sourceTerm.length > 0 && entry.targetTerm.length > 0);
}

export default function LocalizationLocaleDetail({
  tenantSlug,
  localeId,
}: LocalizationLocaleDetailProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localeActionLoading, setLocaleActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [managedLocales, setManagedLocales] = useState<ManagedLocaleOption[]>([]);
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [settings, setSettings] = useState<LocalizationSettingsData>({
    default_locale_id: null,
    brand_instructions: '',
    preferred_tone: 'neutral',
  });
  const [glossaries, setGlossaries] = useState<GlossarySummary[]>([]);
  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(null);
  const [entryDrafts, setEntryDrafts] = useState<GlossaryEntryDraft[]>([createEntryDraft()]);
  const [newGlossaryName, setNewGlossaryName] = useState('');

  const fetchAll = useCallback(async () => {
    const [managedRes, settingsRes, glossariesRes] = await Promise.all([
      fetch(`/api/${tenantSlug}/locales?includeInactive=1&includeUsage=1`),
      fetch(`/api/${tenantSlug}/localization/settings`),
      fetch(`/api/${tenantSlug}/localization/glossaries`),
    ]);

    if (!managedRes.ok) throw new Error('Failed to load locales');
    if (!settingsRes.ok) throw new Error('Failed to load localization settings');
    if (!glossariesRes.ok) throw new Error('Failed to load glossaries');

    const managedPayload = (await managedRes.json()) as ManagedLocaleOption[];
    const settingsPayload = (await settingsRes.json()) as {
      data?: { settings?: LocalizationSettingsData; locales?: LocaleOption[] };
    };
    const glossariesPayload = (await glossariesRes.json()) as {
      data?: { glossaries?: GlossarySummary[] };
    };

    setManagedLocales(Array.isArray(managedPayload) ? managedPayload : []);
    setLocales(Array.isArray(settingsPayload.data?.locales) ? settingsPayload.data?.locales || [] : []);
    setSettings(
      settingsPayload.data?.settings || {
        default_locale_id: null,
        brand_instructions: '',
        preferred_tone: 'neutral',
      }
    );
    setGlossaries(glossariesPayload.data?.glossaries || []);
  }, [tenantSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await fetchAll();
      } catch (fetchError) {
        if (!cancelled) {
          console.error('Failed to load locale detail:', fetchError);
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load locale setup');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const locale = useMemo(
    () => managedLocales.find((entry) => entry.id === localeId) || null,
    [localeId, managedLocales]
  );
  const sourceLocale = useMemo(
    () => locales.find((entry) => entry.id === settings.default_locale_id) || null,
    [locales, settings.default_locale_id]
  );

  const pairGlossaries = useMemo(() => {
    if (!locale || !sourceLocale || sourceLocale.id === locale.id) return [];
    return glossaries.filter(
      (glossary) =>
        glossary.source_language_code.trim().toLowerCase() === sourceLocale.code.trim().toLowerCase() &&
        glossary.target_language_code.trim().toLowerCase() === locale.code.trim().toLowerCase()
    );
  }, [glossaries, locale, sourceLocale]);

  const selectedGlossary = useMemo(
    () => pairGlossaries.find((entry) => entry.id === selectedGlossaryId) || pairGlossaries[0] || null,
    [pairGlossaries, selectedGlossaryId]
  );

  const loadSelectedGlossaryEntries = useCallback(async () => {
    if (!selectedGlossary) {
      setEntryDrafts([createEntryDraft()]);
      return;
    }

    const response = await fetch(`/api/${tenantSlug}/localization/glossaries/${selectedGlossary.id}/entries`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load glossary entries');
    }
    const payload = (await response.json()) as { data?: { entries?: GlossaryEntry[] } };
    setEntryDrafts(toEntryDrafts(payload.data?.entries || []));
  }, [selectedGlossary, tenantSlug]);

  useEffect(() => {
    if (!selectedGlossary) {
      setEntryDrafts([createEntryDraft()]);
      return;
    }
    void loadSelectedGlossaryEntries().catch((entryError) => {
      console.error('Failed to load locale glossary entries:', entryError);
      setError(entryError instanceof Error ? entryError.message : 'Failed to load glossary entries');
    });
  }, [loadSelectedGlossaryEntries, selectedGlossary]);

  const handleLocaleStateChange = useCallback(
    async (action: 'activate' | 'deactivate' | 'set-default') => {
      if (!locale) return;
      try {
        setLocaleActionLoading(true);
        setError(null);
        setSaveNotice(null);

        if (action === 'deactivate') {
          const confirmed = window.confirm(`Deactivate ${localeDisplayName(locale)}? It will remain in history but disappear from normal authoring.`);
          if (!confirmed) return;
        }

        const response = await fetch(`/api/${tenantSlug}/locales`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            action === 'set-default'
              ? { localeId: locale.id, isDefault: true }
              : { localeId: locale.id, isActive: action === 'activate' }
          ),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to update locale');
        }
        await fetchAll();
        setSaveNotice(
          action === 'set-default'
            ? `${localeDisplayName(locale)} is now the default locale.`
            : action === 'activate'
              ? `${localeDisplayName(locale)} reactivated.`
              : `${localeDisplayName(locale)} deactivated.`
        );
      } catch (localeError) {
        console.error('Failed to update locale:', localeError);
        setError(localeError instanceof Error ? localeError.message : 'Failed to update locale');
      } finally {
        setLocaleActionLoading(false);
      }
    },
    [fetchAll, locale, tenantSlug]
  );

  const handleSaveAdaptation = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/localization/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredTone: settings.preferred_tone,
          brandInstructions: settings.brand_instructions,
          defaultLocaleId: settings.default_locale_id,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save adaptation settings');
      }
      setSaveNotice('Adaptation defaults saved.');
    } catch (saveError) {
      console.error('Failed to save adaptation defaults:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to save adaptation defaults');
    } finally {
      setSaving(false);
    }
  }, [settings, tenantSlug]);

  const handleCreateGlossary = useCallback(async () => {
    if (!locale || !sourceLocale) return;
    const entries = normalizeEntries(entryDrafts);
    if (!newGlossaryName.trim()) {
      setError('Glossary name is required.');
      return;
    }
    if (entries.length === 0) {
      setError('Add at least one glossary term pair.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/localization/glossaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGlossaryName.trim(),
          sourceLocaleId: sourceLocale.id,
          targetLocaleId: locale.id,
          entries,
          createProviderGlossary: true,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to create glossary');
      }
      await fetchAll();
      setNewGlossaryName('');
      setSaveNotice('Glossary created.');
    } catch (glossaryError) {
      console.error('Failed to create glossary:', glossaryError);
      setError(glossaryError instanceof Error ? glossaryError.message : 'Failed to create glossary');
    } finally {
      setSaving(false);
    }
  }, [entryDrafts, fetchAll, locale, newGlossaryName, sourceLocale, tenantSlug]);

  const handleSaveGlossaryEntries = useCallback(async () => {
    if (!selectedGlossary) return;
    const entries = normalizeEntries(entryDrafts);
    if (entries.length === 0) {
      setError('Add at least one glossary term pair.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/localization/glossaries/${selectedGlossary.id}/entries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to update glossary');
      }
      setSaveNotice('Glossary updated.');
      await loadSelectedGlossaryEntries();
    } catch (glossaryError) {
      console.error('Failed to update glossary:', glossaryError);
      setError(glossaryError instanceof Error ? glossaryError.message : 'Failed to update glossary');
    } finally {
      setSaving(false);
    }
  }, [entryDrafts, loadSelectedGlossaryEntries, selectedGlossary, tenantSlug]);

  const handleDeleteGlossary = useCallback(async () => {
    if (!selectedGlossary) return;
    const confirmed = window.confirm(`Delete glossary "${selectedGlossary.name}"?`);
    if (!confirmed) return;
    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/localization/glossaries/${selectedGlossary.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to delete glossary');
      }
      await fetchAll();
      setSelectedGlossaryId(null);
      setEntryDrafts([createEntryDraft()]);
      setSaveNotice('Glossary deleted.');
    } catch (glossaryError) {
      console.error('Failed to delete glossary:', glossaryError);
      setError(glossaryError instanceof Error ? glossaryError.message : 'Failed to delete glossary');
    } finally {
      setSaving(false);
    }
  }, [fetchAll, selectedGlossary, tenantSlug]);

  const backLink = (
    <Link
      href={`/${tenantSlug}/settings/localization`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      Back to Localization
    </Link>
  );

  return (
    <SettingsSecondLevelPage page="localization" backLink={backLink}>
      {loading ? (
        <PageSkeleton text="Loading locale setup..." size="lg" />
      ) : (
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            {locale ? localeDisplayName(locale) : 'Locale'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure terminology and adaptation for this locale.
          </p>
        </div>
      )}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {saveNotice ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {saveNotice}
        </div>
      ) : null}

      {!loading && !locale ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Locale not found.
          </CardContent>
        </Card>
      ) : locale ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Locale</CardTitle>
              <CardDescription>Manage default status and activation for this locale.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{localeDisplayName(locale)}</span>
                  <span className="text-sm text-muted-foreground">{locale.code}</span>
                  {locale.is_default ? <Badge variant="success">Default</Badge> : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {locale.is_active && !locale.is_default ? (
                  <Button variant="outline" size="sm" disabled={localeActionLoading} onClick={() => void handleLocaleStateChange('set-default')}>
                    Set default
                  </Button>
                ) : null}
                <Switch
                  checked={locale.is_active}
                  disabled={localeActionLoading || (locale.is_default && locale.is_active)}
                  onCheckedChange={(checked) => {
                    void handleLocaleStateChange(checked ? 'activate' : 'deactivate');
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Adaptation</CardTitle>
              <CardDescription>
                Shared workspace adaptation defaults used when AI rewrites content for this locale.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="text-sm font-medium">Preferred Brand Tone</div>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={settings.preferred_tone}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      preferred_tone: event.target.value as LocalizationSettingsData['preferred_tone'],
                    }))
                  }
                >
                  <option value="neutral">Neutral</option>
                  <option value="formal">Formal</option>
                  <option value="informal">Informal</option>
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Brand Instructions</div>
                <Textarea
                  value={settings.brand_instructions || ''}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      brand_instructions: event.target.value,
                    }))
                  }
                  placeholder="Example: Keep tone premium and concise. Never use slang. Emphasize clinical efficacy and compliance-safe claims."
                  rows={5}
                />
                <div className="text-xs text-muted-foreground">
                  These are shared workspace defaults. They steer AI adaptation after translation.
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => void handleSaveAdaptation()} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Adaptation'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Glossary</CardTitle>
              <CardDescription>
                {sourceLocale && sourceLocale.id !== locale.id
                  ? `Manage terminology for ${sourceLocale.name} → ${localeDisplayName(locale)}.`
                  : 'The default locale does not need a translation glossary.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!sourceLocale || sourceLocale.id === locale.id ? (
                <div className="rounded-md border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                  This locale is the default content locale. Translation glossaries are only needed for target locales.
                </div>
              ) : (
                <>
                  {pairGlossaries.length > 1 ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Existing glossaries</div>
                      <div className="space-y-2">
                        {pairGlossaries.map((glossary) => (
                          <button
                            key={glossary.id}
                            type="button"
                            onClick={() => setSelectedGlossaryId(glossary.id)}
                            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left ${selectedGlossary?.id === glossary.id ? 'border-primary/60 bg-primary/5' : 'border-border/60'}`}
                          >
                            <div>
                              <div className="text-sm font-medium">{glossary.name}</div>
                              <div className="text-xs text-muted-foreground">{glossary.entry_count} terms</div>
                            </div>
                            <Badge variant={glossary.is_active ? 'success' : 'secondary'}>
                              {glossary.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!selectedGlossary ? (
                    <div className="space-y-4 rounded-md border border-border/60 p-3">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Glossary Name</div>
                        <Input
                          value={newGlossaryName}
                          onChange={(event) => setNewGlossaryName(event.target.value)}
                          placeholder={`${sourceLocale.code} -> ${locale.code} terms`}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Glossary Terms</div>
                        <div className="space-y-2">
                          {entryDrafts.map((entry) => (
                            <div key={entry.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                              <Input
                                value={entry.sourceTerm}
                                onChange={(event) =>
                                  setEntryDrafts((prev) =>
                                    prev.map((draft) =>
                                      draft.id === entry.id ? { ...draft, sourceTerm: event.target.value } : draft
                                    )
                                  )
                                }
                                placeholder="Source term"
                              />
                              <Input
                                value={entry.targetTerm}
                                onChange={(event) =>
                                  setEntryDrafts((prev) =>
                                    prev.map((draft) =>
                                      draft.id === entry.id ? { ...draft, targetTerm: event.target.value } : draft
                                    )
                                  )
                                }
                                placeholder="Target term"
                              />
                              <Button
                                variant="outline"
                                onClick={() =>
                                  setEntryDrafts((prev) =>
                                    prev.length === 1 ? [createEntryDraft()] : prev.filter((draft) => draft.id !== entry.id)
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button variant="outline" onClick={() => setEntryDrafts((prev) => [...prev, createEntryDraft()])}>
                          Add term
                        </Button>
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={() => void handleCreateGlossary()} disabled={saving}>
                          {saving ? 'Creating...' : 'Create Glossary'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-md border border-border/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{selectedGlossary.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {selectedGlossary.source_language_code} → {selectedGlossary.target_language_code}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={selectedGlossary.is_active ? 'success' : 'secondary'}>
                            {selectedGlossary.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Button variant="outline" size="sm" onClick={() => void handleDeleteGlossary()} disabled={saving}>
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {entryDrafts.map((entry) => (
                          <div key={entry.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                            <Input
                              value={entry.sourceTerm}
                              onChange={(event) =>
                                setEntryDrafts((prev) =>
                                  prev.map((draft) =>
                                    draft.id === entry.id ? { ...draft, sourceTerm: event.target.value } : draft
                                  )
                                )
                              }
                              placeholder="Source term"
                            />
                            <Input
                              value={entry.targetTerm}
                              onChange={(event) =>
                                setEntryDrafts((prev) =>
                                  prev.map((draft) =>
                                    draft.id === entry.id ? { ...draft, targetTerm: event.target.value } : draft
                                  )
                                )
                              }
                              placeholder="Target term"
                            />
                            <Button
                              variant="outline"
                              onClick={() =>
                                setEntryDrafts((prev) =>
                                  prev.length === 1 ? [createEntryDraft()] : prev.filter((draft) => draft.id !== entry.id)
                                )
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <Button variant="outline" onClick={() => setEntryDrafts((prev) => [...prev, createEntryDraft()])}>
                          Add term
                        </Button>
                        <Button onClick={() => void handleSaveGlossaryEntries()} disabled={saving}>
                          {saving ? 'Saving...' : 'Save Glossary'}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </SettingsSecondLevelPage>
  );
}
