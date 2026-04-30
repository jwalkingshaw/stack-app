'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ItemList } from '@/components/ui/item-list';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { SettingsPageContent } from './settings-page-content';

interface LocalizationLocalesIndexProps {
  tenantSlug: string;
}

interface LocaleCatalogEntry {
  code: string;
  name: string;
  sort_order?: number;
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

function localeDisplayName(locale: Pick<ManagedLocaleOption, 'display_name' | 'name'>): string {
  return locale.display_name || locale.name;
}

function localeUsageSummary(locale: ManagedLocaleOption): string {
  const chunks: string[] = [];
  if ((locale.market_count || 0) > 0) chunks.push(`${locale.market_count} markets`);
  if ((locale.glossary_count || 0) > 0) chunks.push(`${locale.glossary_count} glossaries`);
  return chunks.join(' • ') || 'No active references';
}

export default function LocalizationLocalesIndex({ tenantSlug }: LocalizationLocalesIndexProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [localeActionLoading, setLocaleActionLoading] = useState(false);
  const [managedLocales, setManagedLocales] = useState<ManagedLocaleOption[]>([]);
  const [localeCatalog, setLocaleCatalog] = useState<LocaleCatalogEntry[]>([]);
  const [showAddLocaleDialog, setShowAddLocaleDialog] = useState(false);
  const [newLocaleCode, setNewLocaleCode] = useState('');
  const [localeSearchQuery, setLocaleSearchQuery] = useState('');

  const fetchManagedLocales = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/locales?includeInactive=1&includeUsage=1`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load organization locales');
    }

    const payload = (await response.json()) as ManagedLocaleOption[];
    setManagedLocales(Array.isArray(payload) ? payload : []);
  }, [tenantSlug]);

  const fetchLocaleCatalog = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/settings/reference-data`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load locale catalog');
    }

    const payload = (await response.json()) as { locale_catalog?: LocaleCatalogEntry[] };
    setLocaleCatalog(Array.isArray(payload.locale_catalog) ? payload.locale_catalog : []);
  }, [tenantSlug]);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSaveNotice(null);
      await Promise.all([fetchManagedLocales(), fetchLocaleCatalog()]);
    } catch (fetchError) {
      console.error('Failed to load localization locale index:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load locales');
    } finally {
      setLoading(false);
    }
  }, [fetchLocaleCatalog, fetchManagedLocales]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const visibleManagedLocales = useMemo(() => {
    return [...managedLocales].sort((left, right) => {
      const leftDefault = left.is_default ? 1 : 0;
      const rightDefault = right.is_default ? 1 : 0;
      if (leftDefault !== rightDefault) return rightDefault - leftDefault;

      const leftActive = left.is_active ? 1 : 0;
      const rightActive = right.is_active ? 1 : 0;
      if (leftActive !== rightActive) return rightActive - leftActive;

      return localeDisplayName(left).localeCompare(localeDisplayName(right));
    });
  }, [managedLocales]);

  const availableLocaleCatalogEntries = useMemo(() => {
    const activeCodes = new Set(
      managedLocales.filter((locale) => locale.is_active).map((locale) => locale.code.toLowerCase())
    );
    return localeCatalog
      .filter((locale) => !activeCodes.has(locale.code.toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [localeCatalog, managedLocales]);

  const filteredLocaleCatalogEntries = useMemo(() => {
    const query = localeSearchQuery.trim().toLowerCase();
    if (!query) return availableLocaleCatalogEntries;
    return availableLocaleCatalogEntries.filter((locale) =>
      locale.name.toLowerCase().includes(query) || locale.code.toLowerCase().includes(query)
    );
  }, [availableLocaleCatalogEntries, localeSearchQuery]);

  const handleLocaleStateChange = useCallback(
    async (locale: ManagedLocaleOption, action: 'activate' | 'deactivate' | 'set-default') => {
      try {
        setLocaleActionLoading(true);
        setError(null);
        setSaveNotice(null);

        if (action === 'deactivate') {
          const warningChunks: string[] = [];
          if ((locale.field_value_count || 0) > 0) warningChunks.push(`${locale.field_value_count} field values`);
          if ((locale.market_count || 0) > 0) warningChunks.push(`${locale.market_count} markets`);
          if ((locale.glossary_count || 0) > 0) warningChunks.push(`${locale.glossary_count} glossaries`);
          if ((locale.job_count || 0) > 0) warningChunks.push(`${locale.job_count} jobs`);
          const warning = warningChunks.length > 0 ? ` This locale is currently referenced by ${warningChunks.join(', ')}.` : '';
          const confirmed = window.confirm(`Deactivate ${localeDisplayName(locale)}?${warning} It will remain in history but disappear from normal authoring.`);
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

        await fetchManagedLocales();
        setSaveNotice(
          action === 'set-default'
            ? `${localeDisplayName(locale)} is now the default locale.`
            : action === 'activate'
              ? `${localeDisplayName(locale)} reactivated.`
              : `${localeDisplayName(locale)} deactivated.`
        );
      } catch (localeError) {
        console.error('Failed to update locale state:', localeError);
        setError(localeError instanceof Error ? localeError.message : 'Failed to update locale');
      } finally {
        setLocaleActionLoading(false);
      }
    },
    [fetchManagedLocales, tenantSlug]
  );

  const handleActivateLocaleFromCatalog = useCallback(async () => {
    if (!newLocaleCode) {
      setError('Select a locale to add.');
      return;
    }

    try {
      setLocaleActionLoading(true);
      setError(null);
      const locale = localeCatalog.find((entry) => entry.code === newLocaleCode);
      const response = await fetch(`/api/${tenantSlug}/locales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newLocaleCode,
          name: locale?.name || newLocaleCode,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to add locale');
      }

      await fetchManagedLocales();
      setSaveNotice(`${locale?.name || newLocaleCode} added.`);
      setShowAddLocaleDialog(false);
      setNewLocaleCode('');
      setLocaleSearchQuery('');
    } catch (localeError) {
      console.error('Failed to add locale:', localeError);
      setError(localeError instanceof Error ? localeError.message : 'Failed to add locale');
    } finally {
      setLocaleActionLoading(false);
    }
  }, [fetchManagedLocales, localeCatalog, newLocaleCode, tenantSlug]);

  return (
    <SettingsPageContent page="localization" modeOverride="form">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Localization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage active locales here. Each locale opens its own setup page for terminology and adaptation.
        </p>
      </div>

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

      <ItemList
        items={visibleManagedLocales}
        loading={loading}
        getKey={(locale) => locale.id}
        renderTitle={(locale) => (
          <div className="flex flex-wrap items-center gap-2">
            <span>{localeDisplayName(locale)}</span>
            <span className="text-xs font-normal text-muted-foreground">{locale.code}</span>
          </div>
        )}
        renderSubtitle={(locale) => localeUsageSummary(locale)}
        renderRight={(locale) => (
          <div className="flex flex-wrap items-center gap-2">
            {locale.is_default ? <Badge variant="success">Default</Badge> : null}
            {locale.is_active && !locale.is_default ? (
              <Button
                size="sm"
                variant="outline"
                disabled={localeActionLoading}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleLocaleStateChange(locale, 'set-default');
                }}
              >
                Set default
              </Button>
            ) : null}
            <Switch
              checked={locale.is_active}
              disabled={localeActionLoading || (locale.is_default && locale.is_active)}
              onCheckedChange={(checked) => {
                void handleLocaleStateChange(locale, checked ? 'activate' : 'deactivate');
              }}
            />
          </div>
        )}
        onClickItem={(locale) => router.push(`/${tenantSlug}/settings/localization/locales/${locale.id}`)}
        emptyMessage="No locales yet."
        headerLabel="locale entries"
        onCreate={() => {
          setError(null);
          setSaveNotice(null);
          setShowAddLocaleDialog(true);
        }}
        createLabel="Add locale"
      />

      <Dialog
        open={showAddLocaleDialog}
        onOpenChange={(open) => {
          if (localeActionLoading) return;
          setShowAddLocaleDialog(open);
          if (!open) {
            setNewLocaleCode('');
            setLocaleSearchQuery('');
          }
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Add Locale</DialogTitle>
            <DialogDescription>
              Activate a locale for this organization. It will then be available across Product Detail, syndication, and locale setup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Locale</div>
              <SearchableSelect
                options={filteredLocaleCatalogEntries.map((locale) => ({
                  value: locale.code,
                  label: locale.name,
                  secondaryLabel: locale.code,
                }))}
                value={newLocaleCode}
                onValueChange={setNewLocaleCode}
                searchValue={localeSearchQuery}
                onSearchChange={setLocaleSearchQuery}
                searchPlaceholder="Search locales"
                emptyMessage="No locales match your search."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddLocaleDialog(false);
                  setNewLocaleCode('');
                  setLocaleSearchQuery('');
                }}
                disabled={localeActionLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleActivateLocaleFromCatalog}
                disabled={localeActionLoading || !newLocaleCode || availableLocaleCatalogEntries.length === 0}
              >
                {localeActionLoading ? 'Adding...' : 'Add locale'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsPageContent>
  );
}
