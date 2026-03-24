'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ItemList } from '@/components/ui/item-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tradetool/ui';
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

type SetSummary = AssetSetSummary | ProductSetSummary;

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

function setSubtitle(set: SetSummary): string {
  const parts: string[] = [];
  if (set.module_key === 'assets') {
    const count = set.asset_count + set.folder_count;
    parts.push(count > 0 ? `${set.asset_count} assets · ${set.folder_count} folders` : '0 items');
  } else {
    const count = set.product_count + set.variant_count;
    parts.push(count > 0 ? `${set.product_count} products · ${set.variant_count} variants` : '0 items');
  }
  if (set.market_count > 0) parts.push(`${set.market_count} markets`);
  return parts.join(' · ');
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

  const allSets = useMemo<SetSummary[]>(() => {
    return [...assetSets, ...productSets].sort((a, b) => a.name.localeCompare(b.name));
  }, [assetSets, productSets]);

  const filteredSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allSets;
    return allSets.filter((s) => s.name.toLowerCase().includes(q));
  }, [allSets, search]);

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
      if (!response.ok) throw new Error(payload.error || 'Failed to create set');
      const createdSetId = payload.data?.id || payload.id;
      setShowCreateDialog(false);
      setCreateName('');
      if (createdSetId) {
        router.push(`/${tenantSlug}/settings/sets/${createdSetId}`);
      } else {
        await fetchSets();
      }
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Failed to create set'));
    } finally {
      setCreating(false);
    }
  }, [createModule, createName, creating, fetchSets, router, tenantSlug]);

  return (
    <>
      <SettingsPageContent page="sets">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Sets</h2>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ItemList
          items={filteredSets}
          getKey={(s) => s.id}
          renderTitle={(s) => s.name}
          renderSubtitle={(s) => setSubtitle(s)}
          renderRight={(s) => (
            <div className="flex items-center gap-2">
              <Badge variant={s.module_key === 'assets' ? 'info' : 'purple'}>
                {s.module_key === 'assets' ? 'Assets' : 'Products'}
              </Badge>
              {s.grant_count > 0 ? (
                <Badge variant="secondary">{s.grant_count} shared</Badge>
              ) : null}
            </div>
          )}
          onClickItem={(s) => router.push(`/${tenantSlug}/settings/sets/${s.id}`)}
          loading={loading}
          loadingRows={6}
          emptyMessage={search.trim() ? 'No sets match your search.' : 'No sets yet. Create one to get started.'}
          headerLabel="sets"
          headerAction={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Add set
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => openCreateDialog('assets')}>
                  Asset set
                </DropdownMenuItem>
                {productSetsEnabled ? (
                  <DropdownMenuItem onSelect={() => openCreateDialog('products')}>
                    Product set
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
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
              Create {createModule === 'assets' ? 'Asset' : 'Product'} Set
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Set name *
              </label>
              <Input
                placeholder="e.g. Partner Catalog, Hero Images"
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
                {creating ? 'Creating...' : 'Create set'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
