'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Link2, Package, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/ui/loading-spinner';

interface SetsSettingsProps {
  tenantSlug: string;
}

type ShareSetModule = 'assets' | 'products';

interface AssetSetSummary {
  id: string;
  module_key: 'assets';
  name: string;
  description: string | null;
  asset_count: number;
  folder_count: number;
  item_count: number;
  scoped_item_count: number;
  market_count: number;
  channel_count: number;
  locale_count: number;
  shared_with_member_count: number;
  grant_count: number;
  created_at: string | null;
  updated_at: string | null;
}

interface ProductSetSummary {
  id: string;
  module_key: 'products';
  name: string;
  description: string | null;
  product_count: number;
  variant_count: number;
  item_count: number;
  scoped_item_count: number;
  market_count: number;
  channel_count: number;
  locale_count: number;
  shared_with_member_count: number;
  grant_count: number;
  created_at: string | null;
  updated_at: string | null;
}

interface ShareSetOption {
  id: string;
  module_key: ShareSetModule;
  name: string;
}

interface PartnerOption {
  id: string;
  name: string;
  slug: string;
  partner_category: string | null;
}

interface PartnerGrant {
  id: string;
  partner_organization_id: string;
  access_level: 'view' | 'edit';
  status: 'active' | 'revoked';
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  partner: PartnerOption | null;
}

interface SetsPayload {
  success: boolean;
  data: {
    asset_sets: AssetSetSummary[];
    product_sets: ProductSetSummary[];
  };
  meta?: {
    page: number;
    page_size: number;
    total_asset_sets: number;
    total_product_sets: number;
    total_sets?: number;
    total_active_grants?: number;
    total_shared_partners?: number;
  };
  capabilities?: {
    product_sets_enabled: boolean;
    share_sets_v2?: boolean;
  };
}

interface SetGrantsPayload {
  success: boolean;
  data: {
    grants: PartnerGrant[];
    available_partners: PartnerOption[];
  };
}

export default function SetsSettings({ tenantSlug }: SetsSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createName, setCreateName] = useState('');
  const [createModule, setCreateModule] = useState<ShareSetModule>('assets');
  const [assetSets, setAssetSets] = useState<AssetSetSummary[]>([]);
  const [productSets, setProductSets] = useState<ProductSetSummary[]>([]);
  const [totalAssetSets, setTotalAssetSets] = useState(0);
  const [totalProductSets, setTotalProductSets] = useState(0);
  const [totalActiveGrants, setTotalActiveGrants] = useState(0);
  const [totalSharedPartners, setTotalSharedPartners] = useState(0);
  const [productSetsEnabled, setProductSetsEnabled] = useState(false);
  const [shareSetsV2Enabled, setShareSetsV2Enabled] = useState(false);
  const [selectedGrantSetId, setSelectedGrantSetId] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [grantAccessLevel, setGrantAccessLevel] = useState<'view' | 'edit'>('view');
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsSubmitting, setGrantsSubmitting] = useState(false);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [availablePartners, setAvailablePartners] = useState<PartnerOption[]>([]);
  const [activeGrants, setActiveGrants] = useState<PartnerGrant[]>([]);

  const allSets = useMemo<ShareSetOption[]>(
    () => [
      ...assetSets.map((set) => ({
        id: set.id,
        module_key: 'assets' as const,
        name: set.name,
      })),
      ...productSets.map((set) => ({
        id: set.id,
        module_key: 'products' as const,
        name: set.name,
      })),
    ],
    [assetSets, productSets]
  );

  useEffect(() => {
    if (allSets.length === 0) {
      setSelectedGrantSetId('');
      return;
    }
    const exists = allSets.some((set) => set.id === selectedGrantSetId);
    if (!exists) {
      setSelectedGrantSetId(allSets[0].id);
    }
  }, [allSets, selectedGrantSetId]);

  const fetchSets = useCallback(
    async (options?: { refresh?: boolean }) => {
      const isRefresh = Boolean(options?.refresh);
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      try {
        const query = new URLSearchParams();
        if (search.trim()) {
          query.set('search', search.trim());
        }
        query.set('page', '1');
        query.set('pageSize', '50');

        const response = await fetch(`/api/${tenantSlug}/sharing/sets?${query.toString()}`);
        const payload = (await response.json().catch(() => ({}))) as Partial<SetsPayload> & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load sets');
        }

        setAssetSets(payload.data?.asset_sets || []);
        setProductSets(payload.data?.product_sets || []);
        setTotalAssetSets(payload.meta?.total_asset_sets || 0);
        setTotalProductSets(payload.meta?.total_product_sets || 0);
        setTotalActiveGrants(payload.meta?.total_active_grants || 0);
        setTotalSharedPartners(payload.meta?.total_shared_partners || 0);
        setProductSetsEnabled(Boolean(payload.capabilities?.product_sets_enabled));
        setShareSetsV2Enabled(Boolean(payload.capabilities?.share_sets_v2));
      } catch (err: any) {
        setError(err?.message || 'Failed to load sets');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search, tenantSlug]
  );

  const fetchSetGrants = useCallback(
    async (setId: string, options?: { keepSelectedPartner?: boolean }) => {
      if (!setId) {
        setAvailablePartners([]);
        setActiveGrants([]);
        return;
      }

      setGrantsLoading(true);
      setGrantsError(null);
      try {
        const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/grants`);
        const payload = (await response.json().catch(() => ({}))) as Partial<SetGrantsPayload> & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load partner assignments');
        }

        const partners = payload.data?.available_partners || [];
        const grants = payload.data?.grants || [];
        setAvailablePartners(partners);
        setActiveGrants(grants.filter((grant) => grant.status === 'active'));

        if (!options?.keepSelectedPartner) {
          setSelectedPartnerId((prev) => {
            if (prev && partners.some((partner) => partner.id === prev)) {
              return prev;
            }
            return partners[0]?.id || '';
          });
        }
      } catch (err: any) {
        setGrantsError(err?.message || 'Failed to load partner assignments');
        setAvailablePartners([]);
        setActiveGrants([]);
      } finally {
        setGrantsLoading(false);
      }
    },
    [tenantSlug]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchSets();
    }, 250);
    return () => clearTimeout(timeout);
  }, [fetchSets]);

  useEffect(() => {
    if (!selectedGrantSetId || !shareSetsV2Enabled) {
      setAvailablePartners([]);
      setActiveGrants([]);
      return;
    }
    void fetchSetGrants(selectedGrantSetId);
  }, [fetchSetGrants, selectedGrantSetId, shareSetsV2Enabled]);

  const createSet = useCallback(async () => {
    const trimmedName = createName.trim();
    if (!trimmedName) {
      setCreateError('Set name is required');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          module: createModule,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create set');
      }

      setCreateName('');
      await fetchSets({ refresh: true });
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create set');
    } finally {
      setCreating(false);
    }
  }, [createModule, createName, fetchSets, tenantSlug]);

  const assignPartnerGrant = useCallback(async () => {
    if (!selectedGrantSetId || !selectedPartnerId) return;

    setGrantsSubmitting(true);
    setGrantsError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${selectedGrantSetId}/grants`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            partnerOrganizationId: selectedPartnerId,
            accessLevel: grantAccessLevel,
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to assign partner to set');
      }

      await Promise.all([
        fetchSetGrants(selectedGrantSetId, { keepSelectedPartner: true }),
        fetchSets({ refresh: true }),
      ]);
    } catch (err: any) {
      setGrantsError(err?.message || 'Failed to assign partner to set');
    } finally {
      setGrantsSubmitting(false);
    }
  }, [
    fetchSetGrants,
    fetchSets,
    grantAccessLevel,
    selectedGrantSetId,
    selectedPartnerId,
    tenantSlug,
  ]);

  const revokePartnerGrant = useCallback(
    async (grantId: string) => {
      if (!selectedGrantSetId || !grantId) return;

      setRevokingGrantId(grantId);
      setGrantsError(null);
      try {
        const response = await fetch(
          `/api/${tenantSlug}/sharing/sets/${selectedGrantSetId}/grants?grantId=${encodeURIComponent(grantId)}`,
          { method: 'DELETE' }
        );
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to revoke partner assignment');
        }

        await Promise.all([
          fetchSetGrants(selectedGrantSetId, { keepSelectedPartner: true }),
          fetchSets({ refresh: true }),
        ]);
      } catch (err: any) {
        setGrantsError(err?.message || 'Failed to revoke partner assignment');
      } finally {
        setRevokingGrantId(null);
      }
    },
    [fetchSetGrants, fetchSets, selectedGrantSetId, tenantSlug]
  );

  const totals = useMemo(() => {
    const totalAssetItems = assetSets.reduce((sum, row) => sum + row.item_count, 0);
    const totalAssets = assetSets.reduce((sum, row) => sum + row.asset_count, 0);
    const totalFolders = assetSets.reduce((sum, row) => sum + row.folder_count, 0);
    const totalProductItems = productSets.reduce((sum, row) => sum + row.item_count, 0);
    const totalProducts = productSets.reduce((sum, row) => sum + row.product_count, 0);
    const totalVariants = productSets.reduce((sum, row) => sum + row.variant_count, 0);
    return {
      totalAssetItems,
      totalAssets,
      totalFolders,
      totalProductItems,
      totalProducts,
      totalVariants,
    };
  }, [assetSets, productSets]);

  if (loading) {
    return <PageLoader text="Loading sets..." size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-foreground">Sets</h2>
            <p className="text-sm text-muted-foreground">
              Summary-only catalog for scalable set governance. Item-level management stays in Assets and Products.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/${tenantSlug}/settings/team/asset-sets`}>
              <Button variant="outline" size="sm">
                Manage Asset Set Contents
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchSets({ refresh: true })}
              disabled={refreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {!shareSetsV2Enabled ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Legacy mode detected. Apply `packages/database/migrations/20260305_add_share_sets_foundation.sql`, then refresh schema cache and restart the app. Product Sets and Partner Assignments stay disabled until this is available.
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px]">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Module</p>
            <select
              value={createModule}
              onChange={(event) => setCreateModule(event.target.value as ShareSetModule)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              disabled={creating}
            >
              <option value="assets">Assets</option>
              <option value="products">Products</option>
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Set Name</p>
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Example: Mexico Distributor Core"
              disabled={creating}
            />
          </div>
          <Button onClick={createSet} disabled={creating || !createName.trim()}>
            {creating ? 'Creating...' : 'Create Set'}
          </Button>
        </div>
        {createError ? <p className="mt-3 text-sm text-red-600">{createError}</p> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Asset Sets</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{totalAssetSets}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totals.totalAssets} assets, {totals.totalFolders} folders
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Product Sets</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{totalProductSets}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {productSetsEnabled ? `${totals.totalProducts} products, ${totals.totalVariants} variants` : 'Not yet enabled'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Items In Current View</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {totals.totalAssetItems + totals.totalProductItems}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totals.totalAssetItems} asset items, {totals.totalProductItems} product items
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Active Assignments</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{totalActiveGrants}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalSharedPartners} partner orgs in current page scope
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            placeholder="Search set names..."
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">Asset Sets</p>
          <p className="text-xs text-muted-foreground">
            Use this list for governance and assignment decisions, not item-level browsing.
          </p>
        </div>
        {assetSets.length === 0 ? (
          <div className="p-8 text-center">
            <Link2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No asset sets found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {assetSets.map((row) => (
              <div key={row.id} className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-foreground">{row.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {row.id}</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.asset_count}</span> assets
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.folder_count}</span> folders
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.scoped_item_count}</span> scoped
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.shared_with_member_count}</span> partners
                </div>
                <div className="text-sm text-muted-foreground">
                  <Package className="mr-1 inline h-4 w-4" />
                  {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : 'n/a'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">Product Sets</p>
          <p className="text-xs text-muted-foreground">
            Product sets are created here now; membership controls are coming in Products screens.
          </p>
        </div>
        {productSets.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No product sets found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {productSets.map((row) => (
              <div key={row.id} className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-foreground">{row.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {row.id}</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.product_count}</span> products
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.variant_count}</span> variants
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.scoped_item_count}</span> scoped
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.shared_with_member_count}</span> partners
                </div>
                <div className="text-sm text-muted-foreground">
                  <Package className="mr-1 inline h-4 w-4" />
                  {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : 'n/a'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {shareSetsV2Enabled ? (
        <div className="rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">Partner Assignments</p>
            <p className="text-xs text-muted-foreground">
              Assign sets to active partner relationships for controlled cross-organization visibility.
            </p>
          </div>
          {allSets.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Create at least one set before assigning to partners.
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Set</p>
                  <select
                    value={selectedGrantSetId}
                    onChange={(event) => setSelectedGrantSetId(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    {allSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        [{set.module_key}] {set.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Partner</p>
                  <select
                    value={selectedPartnerId}
                    onChange={(event) => setSelectedPartnerId(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    disabled={availablePartners.length === 0}
                  >
                    {availablePartners.length === 0 ? (
                      <option value="">No active partners</option>
                    ) : (
                      availablePartners.map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name} ({partner.slug})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Access</p>
                  <select
                    value={grantAccessLevel}
                    onChange={(event) => setGrantAccessLevel(event.target.value as 'view' | 'edit')}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="view">view</option>
                    <option value="edit">edit</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={assignPartnerGrant}
                    disabled={grantsSubmitting || !selectedGrantSetId || !selectedPartnerId}
                  >
                    {grantsSubmitting ? 'Assigning...' : 'Assign To Partner'}
                  </Button>
                </div>
              </div>

              {grantsError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {grantsError}
                </div>
              ) : null}

              <div className="rounded-lg border border-border">
                <div className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
                  Active Grants
                </div>
                {grantsLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">Loading partner grants...</div>
                ) : activeGrants.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    No active partner assignments for this set.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {activeGrants.map((grant) => (
                      <div
                        key={grant.id}
                        className="grid grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-5"
                      >
                        <div className="md:col-span-2">
                          <p className="text-sm text-foreground">
                            {grant.partner?.name || grant.partner_organization_id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {grant.partner?.slug || 'unknown partner'}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">access: {grant.access_level}</div>
                        <div className="text-sm text-muted-foreground">
                          updated:{' '}
                          {grant.updated_at ? new Date(grant.updated_at).toLocaleDateString() : 'n/a'}
                        </div>
                        <div className="flex justify-start md:justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokePartnerGrant(grant.id)}
                            disabled={revokingGrantId === grant.id}
                          >
                            {revokingGrantId === grant.id ? 'Revoking...' : 'Revoke'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
