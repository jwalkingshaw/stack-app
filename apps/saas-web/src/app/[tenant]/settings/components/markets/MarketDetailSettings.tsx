'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteConfirmDialog } from '@/components/ui/modal-shells';
import { Input } from '@/components/ui/input';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsActionsDropdown } from '../settings-actions-dropdown';
import { SettingsSecondLevelPage } from '../settings-page-content';
import { toMap } from './types';
import { useMarketsSettingsData } from './use-markets-settings-data';

type CatalogSetOption = {
  id: string;
  name: string;
  moduleKey: 'products' | 'assets';
};

type SharingSetsResponse = {
  error?: string;
  data?: {
    asset_sets?: Array<{ id: string; name: string }>;
    product_sets?: Array<{ id: string; name: string }>;
  };
};

type MarketCatalogResponse = {
  error?: string;
  data?: {
    productSetIds?: string[];
    assetSetIds?: string[];
  };
};

type MarketPartner = {
  assignment_id: string;
  partner_organization_id: string;
  name: string;
  slug: string;
  partner_category: string | null;
  valid_from: string | null;
  assigned_at: string;
};

type AvailablePartner = {
  id: string;
  name: string;
  slug: string;
  partner_category: string | null;
};

type MarketPartnersResponse = {
  error?: string;
  data?: {
    partners: MarketPartner[];
    available_partners: AvailablePartner[];
  };
};

interface MarketDetailSettingsProps {
  tenantSlug: string;
  marketId: string;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function haveSameMembers(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false;
  }
  return true;
}

export default function MarketDetailSettings({ tenantSlug, marketId }: MarketDetailSettingsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('general');
  const [addCountryCode, setAddCountryCode] = useState('');
  const [addLocaleId, setAddLocaleId] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  const [productSetOptions, setProductSetOptions] = useState<CatalogSetOption[]>([]);
  const [assetSetOptions, setAssetSetOptions] = useState<CatalogSetOption[]>([]);
  const [productSetIds, setProductSetIds] = useState<string[]>([]);
  const [assetSetIds, setAssetSetIds] = useState<string[]>([]);
  const [initialProductSetIds, setInitialProductSetIds] = useState<string[]>([]);
  const [initialAssetSetIds, setInitialAssetSetIds] = useState<string[]>([]);
  const [addProductSetId, setAddProductSetId] = useState('');
  const [addAssetSetId, setAddAssetSetId] = useState('');

  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState<string | null>(null);
  const [partnerActionLoading, setPartnerActionLoading] = useState(false);
  const [marketPartners, setMarketPartners] = useState<MarketPartner[]>([]);
  const [availablePartnersForMarket, setAvailablePartnersForMarket] = useState<AvailablePartner[]>([]);
  const [addPartnerId, setAddPartnerId] = useState('');
  const catalogLoadedRef = useRef(false);
  const partnersLoadedRef = useRef(false);

  const {
    loading,
    referenceLoading,
    saving,
    error,
    ensureReferenceData,
    runAction,
    patchMarket,
    deleteMarket,
    assignCountry,
    unassignCountry,
    assignLocale,
    unassignLocale,
    markets,
    locales,
    marketLocales,
    marketCountries,
    countries,
  } = useMarketsSettingsData(tenantSlug);

  const localeById = useMemo(() => toMap(locales, 'id'), [locales]);
  const countryByCode = useMemo(() => toMap(countries, 'code'), [countries]);

  const market = useMemo(
    () => markets.find((candidate) => candidate.id === marketId) || null,
    [marketId, markets]
  );

  const activeLocaleIdsByMarket = useMemo(() => {
    const out = new Map<string, string[]>();
    marketLocales.forEach((row) => {
      if (!row.is_active) return;
      const list = out.get(row.market_id) || [];
      list.push(row.locale_id);
      out.set(row.market_id, list);
    });
    return out;
  }, [marketLocales]);

  const activeCountryCodesByMarket = useMemo(() => {
    const out = new Map<string, string[]>();
    marketCountries.forEach((row) => {
      if (!row.is_active) return;
      const list = out.get(row.market_id) || [];
      list.push(row.country_code);
      out.set(row.market_id, list);
    });
    return out;
  }, [marketCountries]);

  const activeLocaleIds = useMemo(
    () => activeLocaleIdsByMarket.get(marketId) || [],
    [activeLocaleIdsByMarket, marketId]
  );
  const activeCountryCodes = useMemo(
    () => activeCountryCodesByMarket.get(marketId) || [],
    [activeCountryCodesByMarket, marketId]
  );

  const availableCountries = useMemo(() => {
    const used = new Set(activeCountryCodes);
    return countries.filter((country) => !used.has(country.code));
  }, [activeCountryCodes, countries]);

  const availableLocales = useMemo(() => {
    const assignedIds = new Set(activeLocaleIds);
    return locales.filter((locale) => locale.is_active && !assignedIds.has(locale.id));
  }, [activeLocaleIds, locales]);

  const productSetById = useMemo(
    () => new Map(productSetOptions.map((set) => [set.id, set])),
    [productSetOptions]
  );
  const assetSetById = useMemo(
    () => new Map(assetSetOptions.map((set) => [set.id, set])),
    [assetSetOptions]
  );
  const availableProductSets = useMemo(
    () => productSetOptions.filter((set) => !productSetIds.includes(set.id)),
    [productSetIds, productSetOptions]
  );
  const availableAssetSets = useMemo(
    () => assetSetOptions.filter((set) => !assetSetIds.includes(set.id)),
    [assetSetIds, assetSetOptions]
  );
  const catalogDirty = useMemo(
    () =>
      !haveSameMembers(productSetIds, initialProductSetIds) ||
      !haveSameMembers(assetSetIds, initialAssetSetIds),
    [assetSetIds, initialAssetSetIds, initialProductSetIds, productSetIds]
  );
  const canDeleteMarket = markets.length > 1;

  const loadSetOptions = useCallback(
    async (moduleKey: 'products' | 'assets'): Promise<CatalogSetOption[]> => {
      const query = new URLSearchParams({
        module: moduleKey,
        page: '1',
        pageSize: '100',
        compact: '1',
      });
      const response = await fetch(`/api/${tenantSlug}/sharing/sets?${query.toString()}`);
      const payload = (await response.json().catch(() => ({}))) as SharingSetsResponse;
      if (!response.ok) {
        throw new Error(payload.error || `Failed to load ${moduleKey} sets.`);
      }
      const rows =
        moduleKey === 'products'
          ? payload.data?.product_sets || []
          : payload.data?.asset_sets || [];
      return rows
        .map((row) => ({
          id: row.id,
          name: row.name,
          moduleKey,
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    [tenantSlug]
  );

  const loadCatalog = useCallback(async () => {
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      setCatalogNotice(null);

      const [loadedProductSets, loadedAssetSets, catalogResponse] = await Promise.all([
        loadSetOptions('products'),
        loadSetOptions('assets'),
        fetch(`/api/${tenantSlug}/markets/${marketId}/catalog`),
      ]);

      const payload = (await catalogResponse.json().catch(() => ({}))) as MarketCatalogResponse;
      if (!catalogResponse.ok) {
        throw new Error(payload.error || 'Failed to load market catalog assignments.');
      }

      const loadedProductSetIds = dedupe(payload.data?.productSetIds || []);
      const loadedAssetSetIds = dedupe(payload.data?.assetSetIds || []);

      setProductSetOptions(loadedProductSets);
      setAssetSetOptions(loadedAssetSets);
      setProductSetIds(loadedProductSetIds);
      setAssetSetIds(loadedAssetSetIds);
      setInitialProductSetIds(loadedProductSetIds);
      setInitialAssetSetIds(loadedAssetSetIds);
      setAddProductSetId('');
      setAddAssetSetId('');
      catalogLoadedRef.current = true;
    } catch (loadError) {
      console.error('Failed to load market catalog:', loadError);
      setCatalogError(
        loadError instanceof Error ? loadError.message : 'Failed to load market catalog assignments.'
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [loadSetOptions, marketId, tenantSlug]);

  useEffect(() => {
    catalogLoadedRef.current = false;
    partnersLoadedRef.current = false;
    setCatalogLoading(false);
    setCatalogError(null);
    setCatalogNotice(null);
    setPartnersLoading(false);
    setPartnersError(null);
  }, [marketId, tenantSlug]);

  useEffect(() => {
    void ensureReferenceData();
  }, [ensureReferenceData]);

  useEffect(() => {
    if (activeTab !== 'catalog' || catalogLoadedRef.current || catalogLoading) return;
    void loadCatalog();
  }, [activeTab, catalogLoading, loadCatalog]);

  const saveCatalogAssignments = useCallback(async () => {
    try {
      setCatalogSaving(true);
      setCatalogError(null);
      setCatalogNotice(null);

      const response = await fetch(`/api/${tenantSlug}/markets/${marketId}/catalog`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productSetIds: dedupe(productSetIds),
          assetSetIds: dedupe(assetSetIds),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as MarketCatalogResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save market catalog assignments.');
      }

      const persistedProductSetIds = dedupe(payload.data?.productSetIds || []);
      const persistedAssetSetIds = dedupe(payload.data?.assetSetIds || []);
      setProductSetIds(persistedProductSetIds);
      setAssetSetIds(persistedAssetSetIds);
      setInitialProductSetIds(persistedProductSetIds);
      setInitialAssetSetIds(persistedAssetSetIds);
      setCatalogNotice('Catalog sets saved.');
    } catch (saveError) {
      console.error('Failed to save market catalog assignments:', saveError);
      setCatalogError(
        saveError instanceof Error ? saveError.message : 'Failed to save market catalog assignments.'
      );
    } finally {
      setCatalogSaving(false);
    }
  }, [assetSetIds, marketId, productSetIds, tenantSlug]);

  const loadPartners = useCallback(async () => {
    try {
      setPartnersLoading(true);
      setPartnersError(null);
      const response = await fetch(`/api/${tenantSlug}/markets/${marketId}/partners`);
      const payload = (await response.json().catch(() => ({}))) as MarketPartnersResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load market partners.');
      }
      setMarketPartners(payload.data?.partners || []);
      setAvailablePartnersForMarket(payload.data?.available_partners || []);
      partnersLoadedRef.current = true;
    } catch (err) {
      setPartnersError(err instanceof Error ? err.message : 'Failed to load market partners.');
    } finally {
      setPartnersLoading(false);
    }
  }, [marketId, tenantSlug]);

  useEffect(() => {
    if (activeTab !== 'partners' || partnersLoadedRef.current || partnersLoading) return;
    void loadPartners();
  }, [activeTab, loadPartners, partnersLoading]);

  const addPartnerToMarket = useCallback(async (partnerOrganizationId: string) => {
    try {
      setPartnerActionLoading(true);
      setPartnersError(null);
      const response = await fetch(`/api/${tenantSlug}/markets/${marketId}/partners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to assign partner to market.');
      }
      await loadPartners();
    } catch (err) {
      setPartnersError(err instanceof Error ? err.message : 'Failed to assign partner to market.');
    } finally {
      setPartnerActionLoading(false);
    }
  }, [loadPartners, marketId, tenantSlug]);

  const removePartnerFromMarket = useCallback(async (partnerOrganizationId: string) => {
    try {
      setPartnerActionLoading(true);
      setPartnersError(null);
      const query = new URLSearchParams({ partnerOrganizationId });
      const response = await fetch(
        `/api/${tenantSlug}/markets/${marketId}/partners?${query.toString()}`,
        { method: 'DELETE' }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to remove partner from market.');
      }
      await loadPartners();
    } catch (err) {
      setPartnersError(err instanceof Error ? err.message : 'Failed to remove partner from market.');
    } finally {
      setPartnerActionLoading(false);
    }
  }, [loadPartners, marketId, tenantSlug]);

  const handleDeleteMarket = useCallback(async () => {
    if (!market || deleteSubmitting) return;
    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      await deleteMarket(market.id);
      router.push(`/${tenantSlug}/settings/markets`);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete market.');
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteMarket, deleteSubmitting, market, router, tenantSlug]);

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading market..." size="lg" />
      </div>
    );
  }

  if (!market) {
    return (
      <SettingsSecondLevelPage
        page="markets"
        backLink={
          <Link
            href={`/${tenantSlug}/settings/markets`}
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Markets</span>
          </Link>
        }
      >
        <div className="rounded-md border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Market not found.
        </div>
      </SettingsSecondLevelPage>
    );
  }

  return (
    <SettingsSecondLevelPage
      page="markets"
      backLink={
        <Link
          href={`/${tenantSlug}/settings/markets`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Markets</span>
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{market.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {market.is_default ? <Badge variant="success">Default</Badge> : null}
            {!market.is_active ? <Badge variant="neutral">Inactive</Badge> : null}
            <SettingsActionsDropdown
              label="Actions"
              disabled={saving || catalogSaving || deleteSubmitting}
              items={[
                {
                  id: 'set-default',
                  label: 'Set as default',
                  disabled: market.is_default || saving || catalogSaving || deleteSubmitting,
                  onSelect: () => {
                    void runAction(
                      () => patchMarket(market.id, { is_default: true }),
                      'Failed to set default market.'
                    );
                  },
                },
                {
                  id: 'toggle-active',
                  label: market.is_active ? 'Disable market' : 'Enable market',
                  disabled: saving || catalogSaving || deleteSubmitting,
                  onSelect: () => {
                    void runAction(
                      () => patchMarket(market.id, { is_active: !market.is_active }),
                      'Failed to update market status.'
                    );
                  },
                },
                {
                  id: 'delete-market',
                  label: 'Delete market',
                  separatorBefore: true,
                  destructive: true,
                  disabled: !canDeleteMarket || deleteSubmitting,
                  onSelect: () => {
                    setDeleteError(null);
                    setDeleteDialogOpen(true);
                  },
                },
              ]}
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="partners">Partners</TabsTrigger>
          </TabsList>

          {/* ── General tab ───────────────────────────────────────── */}
          <TabsContent value="general" className="mt-4 space-y-4">
            {referenceLoading ? (
              <div className="text-xs text-muted-foreground">Loading reference data...</div>
            ) : null}
            <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
              <div className="text-sm font-medium text-foreground">Market</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border/60 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Code:</span> {market.code}
                </div>
                <div className="rounded-md border border-border/60 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Default locale:</span>{' '}
                  {market.default_locale_id
                    ? localeById.get(market.default_locale_id)?.name || localeById.get(market.default_locale_id)?.code || '-'
                    : '-'}
                </div>
              </div>
            </section>

        <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
          <div className="text-sm font-medium text-foreground">Countries</div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Select value={addCountryCode} onValueChange={setAddCountryCode} disabled={referenceLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Add country" />
              </SelectTrigger>
              <SelectContent>
                {availableCountries.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name} ({country.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              disabled={saving || referenceLoading || !addCountryCode}
              onClick={() => {
                if (!addCountryCode) return;
                runAction(
                  () => assignCountry(market.id, addCountryCode),
                  'Failed to assign country.'
                );
                setAddCountryCode('');
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeCountryCodes.map((countryCode) => (
              <div
                key={countryCode}
                className="inline-flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-xs"
              >
                <span>{countryByCode.get(countryCode)?.name || countryCode}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1 text-xs"
                  disabled={saving}
                  onClick={() =>
                    runAction(
                      () => unassignCountry(market.id, countryCode),
                      'Failed to unassign country.'
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            {activeCountryCodes.length === 0 ? (
              <span className="text-sm text-muted-foreground">No countries assigned.</span>
            ) : null}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
          <div className="text-sm font-medium text-foreground">Locales</div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Select value={addLocaleId} onValueChange={setAddLocaleId} disabled={referenceLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Add locale" />
              </SelectTrigger>
              <SelectContent>
                {availableLocales.map((locale) => (
                  <SelectItem key={locale.id} value={locale.id}>
                    {locale.name} ({locale.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              disabled={saving || referenceLoading || !addLocaleId}
              onClick={() => {
                if (!addLocaleId) return;
                runAction(
                  () => assignLocale(market.id, addLocaleId),
                  'Failed to assign locale.'
                );
                setAddLocaleId('');
              }}
            >
              Add
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Markets can attach existing organization locales only. Add missing locales from Localization.
          </div>

          <div className="space-y-2">
            {activeLocaleIds.map((localeId) => {
              const locale = localeById.get(localeId);
              if (!locale) return null;
              const isDefault = market.default_locale_id === locale.id;
              return (
                <div
                  key={locale.id}
                  className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                >
                  <div className="text-sm">
                    {locale.name} <span className="text-xs text-muted-foreground">({locale.code})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving || isDefault}
                      onClick={() =>
                        runAction(
                          () => patchMarket(market.id, { default_locale_id: locale.id }),
                          'Failed to set default locale.'
                        )
                      }
                    >
                      {isDefault ? 'Default' : 'Set default'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        runAction(
                          () => unassignLocale(market.id, locale.id),
                          'Failed to unassign locale.'
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
            {activeLocaleIds.length === 0 ? (
              <span className="text-sm text-muted-foreground">No locales assigned.</span>
            ) : null}
          </div>
          </section>
          </TabsContent>

          {/* ── Catalog tab ───────────────────────────────────────── */}
          <TabsContent value="catalog" className="mt-4 space-y-4">
            {catalogLoading ? (
              <div className="text-sm text-muted-foreground">Loading catalog assignments...</div>
            ) : null}
            {catalogError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {catalogError}
              </div>
            ) : null}
            {catalogNotice ? (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {catalogNotice}
              </div>
            ) : null}
            <section className="space-y-4 rounded-lg border border-border/60 bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">Catalog Sets</div>
                  <p className="text-xs text-muted-foreground">
                    Assign product and asset sets that this market can access.
                  </p>
                </div>
                <Button
                  variant="accent-blue"
              className="gap-2"
              disabled={catalogSaving || catalogLoading || !catalogDirty}
              onClick={saveCatalogAssignments}
            >
              <Save className="h-4 w-4" />
              {catalogSaving ? 'Saving...' : 'Save Sets'}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Product Sets
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Select value={addProductSetId} onValueChange={setAddProductSetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product set" />
                </SelectTrigger>
                <SelectContent>
                  {availableProductSets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                disabled={catalogSaving || catalogLoading || !addProductSetId}
                onClick={() => {
                  if (!addProductSetId) return;
                  setProductSetIds((current) => dedupe([...current, addProductSetId]));
                  setAddProductSetId('');
                }}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {productSetIds.map((setId) => (
                <div
                  key={setId}
                  className="inline-flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-xs"
                >
                  <span>{productSetById.get(setId)?.name || setId}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1 text-xs"
                    disabled={catalogSaving || catalogLoading}
                    onClick={() =>
                      setProductSetIds((current) => current.filter((value) => value !== setId))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {productSetIds.length === 0 ? (
                <span className="text-sm text-muted-foreground">No product sets assigned.</span>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Asset Sets
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Select value={addAssetSetId} onValueChange={setAddAssetSetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select asset set" />
                </SelectTrigger>
                <SelectContent>
                  {availableAssetSets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                disabled={catalogSaving || catalogLoading || !addAssetSetId}
                onClick={() => {
                  if (!addAssetSetId) return;
                  setAssetSetIds((current) => dedupe([...current, addAssetSetId]));
                  setAddAssetSetId('');
                }}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {assetSetIds.map((setId) => (
                <div
                  key={setId}
                  className="inline-flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-xs"
                >
                  <span>{assetSetById.get(setId)?.name || setId}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1 text-xs"
                    disabled={catalogSaving || catalogLoading}
                    onClick={() => setAssetSetIds((current) => current.filter((value) => value !== setId))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {assetSetIds.length === 0 ? (
                <span className="text-sm text-muted-foreground">No asset sets assigned.</span>
              ) : null}
            </div>
            </div>
            </section>
          </TabsContent>

          {/* ── Partners tab ──────────────────────────────────────── */}
          <TabsContent value="partners" className="mt-4 space-y-4">
            <section className="space-y-4 rounded-lg border border-border/60 bg-card p-4">
              <div>
                <div className="text-sm font-medium text-foreground">Partners</div>
                <p className="text-xs text-muted-foreground">
                  Partners assigned here automatically see this market&apos;s catalog sets.
                </p>
              </div>
          {partnersError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {partnersError}
            </div>
          ) : null}
          {partnersLoading ? (
            <p className="text-sm text-muted-foreground">Loading partners...</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Select
                  value={addPartnerId}
                  onValueChange={setAddPartnerId}
                  disabled={partnerActionLoading || partnersLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Add partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePartnersForMarket.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name}
                      </SelectItem>
                    ))}
                    {availablePartnersForMarket.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        No available partners. Add partners from the Partners page first.
                      </div>
                    ) : null}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  disabled={partnerActionLoading || partnersLoading || !addPartnerId}
                  onClick={() => {
                    if (!addPartnerId) return;
                    void addPartnerToMarket(addPartnerId);
                    setAddPartnerId('');
                  }}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {marketPartners.map((partner) => (
                  <div
                    key={partner.assignment_id}
                    className="inline-flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-xs"
                  >
                    <span>{partner.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1 text-xs"
                      disabled={partnerActionLoading}
                      onClick={() => void removePartnerFromMarket(partner.partner_organization_id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {marketPartners.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No partners assigned to this market.</span>
                ) : null}
              </div>
            </>
          )}
            </section>
          </TabsContent>
        </Tabs>

        {/* Error banner for general actions (outside tabs) */}
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteSubmitting) return;
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteError(null);
          }
        }}
        title="Delete Market"
        description={`Delete "${market.name}" permanently. This action cannot be undone.`}
        onConfirm={() => void handleDeleteMarket()}
        confirmLabel="Delete market"
        confirmLoading={deleteSubmitting}
        confirmDisabled={deleteSubmitting || !canDeleteMarket}
        safetyMode={canDeleteMarket ? 'typed' : 'standard'}
        confirmPhrase="DELETE"
      >
        {!canDeleteMarket ? (
          <p className="text-sm text-muted-foreground">
            You must keep at least one market in the workspace.
          </p>
        ) : null}
        {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
      </DeleteConfirmDialog>
    </SettingsSecondLevelPage>
  );
}

