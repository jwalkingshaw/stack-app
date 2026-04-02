'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ItemList } from '@/components/ui/item-list';
import { SettingsPageContent } from './settings-page-content';

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
  grant_count: number;
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
  grant_count: number;
}

interface SetsPayload {
  success: boolean;
  data: {
    asset_sets: AssetSetSummary[];
    product_sets: ProductSetSummary[];
  };
  capabilities?: {
    product_sets_enabled: boolean;
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function assetSetSubtitle(set: AssetSetSummary): string {
  const parts: string[] = [];
  const count = set.asset_count + set.folder_count;
  parts.push(count > 0 ? `${set.asset_count} assets - ${set.folder_count} folders` : '0 items');
  if (set.market_count > 0) parts.push(`${set.market_count} markets`);
  return parts.join(' - ');
}

function productSetSubtitle(set: ProductSetSummary): string {
  const parts: string[] = [];
  const count = set.product_count + set.variant_count;
  parts.push(count > 0 ? `${set.product_count} products - ${set.variant_count} variants` : '0 items');
  if (set.market_count > 0) parts.push(`${set.market_count} markets`);
  return parts.join(' - ');
}

function sharedBadge(grantCount: number) {
  if (grantCount <= 0) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {grantCount} shared
    </span>
  );
}

export default function SetsSettings({ tenantSlug }: SetsSettingsProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetSets, setAssetSets] = useState<AssetSetSummary[]>([]);
  const [productSets, setProductSets] = useState<ProductSetSummary[]>([]);
  const [productSetsEnabled, setProductSetsEnabled] = useState(false);
  const [search, setSearch] = useState('');

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createModule, setCreateModule] = useState<ShareSetModule>('assets');
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchSets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: '1', pageSize: '100' });
      const response = await fetch(`/api/${tenantSlug}/sharing/sets?${query.toString()}`);
      const payload = (await response.json().catch(() => ({}))) as Partial<SetsPayload> & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Failed to load sets');
      setAssetSets(payload.data?.asset_sets || []);
      setProductSets(payload.data?.product_sets || []);
      setProductSetsEnabled(Boolean(payload.capabilities?.product_sets_enabled));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load sets'));
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void fetchSets();
  }, [fetchSets]);

  const filteredAssetSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assetSets;
    return assetSets.filter((s) => s.name.toLowerCase().includes(q));
  }, [assetSets, search]);

  const filteredProductSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return productSets;
    return productSets.filter((s) => s.name.toLowerCase().includes(q));
  }, [productSets, search]);

  const openCreateDialog = useCallback((module: ShareSetModule) => {
    setCreateModule(module);
    setCreateName('');
    setCreateError(null);
    setShowCreateDialog(true);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!createName.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim(), module: createModule }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        data?: { id?: string };
      };
      if (!response.ok) throw new Error(payload.error || 'Failed to create');
      const createdSetId = payload.data?.id || payload.id;
      setShowCreateDialog(false);
      setCreateName('');
      if (createdSetId) {
        router.push(`/${tenantSlug}/settings/sets/${createdSetId}`);
      } else {
        await fetchSets();
      }
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Failed to create'));
    } finally {
      setCreating(false);
    }
  }, [createModule, createName, creating, fetchSets, router, tenantSlug]);

  return (
    <>
      <SettingsPageContent page="sets">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Sharing</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the product catalogs and brand libraries you share with partners.
          </p>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Product Catalogs section */}
        {productSetsEnabled ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Product Catalogs</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Share curated product lists with partners. Product images and documents are included automatically.
              </p>
            </div>
            <ItemList
              items={filteredProductSets}
              getKey={(s) => s.id}
              renderTitle={(s) => s.name}
              renderSubtitle={(s) => productSetSubtitle(s)}
              renderRight={(s) => sharedBadge(s.grant_count)}
              onClickItem={(s) => router.push(`/${tenantSlug}/settings/sets/${s.id}`)}
              loading={loading}
              loadingRows={3}
              emptyMessage={search.trim() ? 'No catalogs match your search.' : 'No product catalogs yet.'}
              headerLabel="product catalogs"
              onCreate={() => openCreateDialog('products')}
              createLabel="Add product catalog"
            />
          </div>
        ) : null}

        {/* Brand Libraries section */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Brand Libraries</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share standing brand files with partners - guidelines, compliance certificates, facility documents, and brand materials.
            </p>
          </div>
          <ItemList
            items={filteredAssetSets}
            getKey={(s) => s.id}
            renderTitle={(s) => s.name}
            renderSubtitle={(s) => assetSetSubtitle(s)}
            renderRight={(s) => sharedBadge(s.grant_count)}
            onClickItem={(s) => router.push(`/${tenantSlug}/settings/sets/${s.id}`)}
            loading={loading}
            loadingRows={3}
            emptyMessage={search.trim() ? 'No libraries match your search.' : 'No brand libraries yet.'}
            headerLabel="brand libraries"
            onCreate={() => openCreateDialog('assets')}
            createLabel="Add brand library"
          />
        </div>
      </SettingsPageContent>

      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (creating) return;
          setShowCreateDialog(open);
          if (!open) setCreateName('');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createModule === 'assets' ? 'Create Brand Library' : 'Create Product Catalog'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Name *
              </label>
              <Input
                placeholder={createModule === 'assets' ? 'e.g. Brand Guidelines, Compliance Docs' : 'e.g. Partner Catalog, Summer Range'}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                autoFocus
              />
            </div>
            {createError ? (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {createError}
              </div>
            ) : null}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="accent-blue"
                onClick={() => void handleCreate()}
                disabled={creating || !createName.trim()}
                className="flex-1"
              >
                {creating ? 'Creating...' : createModule === 'assets' ? 'Create library' : 'Create catalog'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
