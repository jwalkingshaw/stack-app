'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ItemList } from '@/components/ui/item-list';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { FullscreenFormModal } from '@/components/ui/modal-shells';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SettingsPageContent } from './settings-page-content';

interface DestinationsSettingsProps {
  tenantSlug: string;
}

interface DestinationRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  channel_id: string | null;
  market_id: string | null;
  sort_order: number;
}

interface ChannelRecord {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface MarketRecord {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

type DestinationDraft = {
  name: string;
  code: string;
  description: string;
  channel_id: string;
  market_id: string;
  sort_order: string;
  is_active: boolean;
};

const NONE_VALUE = '__none__';
const EMPTY_DRAFT: DestinationDraft = {
  name: '',
  code: '',
  description: '',
  channel_id: '',
  market_id: '',
  sort_order: '0',
  is_active: true,
};

const generateCode = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

const isFallbackDestination = (destination: DestinationRecord) => destination.id.startsWith('channel-');

const notifyMarketContextRefresh = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('market-context:refresh'));
};

export default function DestinationsSettings({ tenantSlug }: DestinationsSettingsProps) {
  const [destinations, setDestinations] = useState<DestinationRecord[]>([]);
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<DestinationRecord | null>(null);
  const [draft, setDraft] = useState<DestinationDraft>(EMPTY_DRAFT);
  const scopeDataReadyRef = useRef(false);
  const scopeDataRequestRef = useRef<Promise<void> | null>(null);

  const fetchScopeData = useCallback(async () => {
    if (scopeDataReadyRef.current) return;
    if (scopeDataRequestRef.current) {
      await scopeDataRequestRef.current;
      return;
    }

    const request = (async () => {
      try {
        setScopeLoading(true);
        const response = await fetch(`/api/${tenantSlug}/market-context`);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || 'Failed to load channels and markets.');
        }

        const payload = await response.json().catch(() => ({}));
        const nextChannels = Array.isArray(payload?.channels)
          ? payload.channels.filter((item: ChannelRecord) => item?.is_active)
          : [];
        const nextMarkets = Array.isArray(payload?.markets)
          ? payload.markets.filter((item: MarketRecord) => item?.is_active)
          : [];

        setChannels(nextChannels);
        setMarkets(nextMarkets);
        scopeDataReadyRef.current = true;
      } catch (scopeError) {
        console.error('Failed to load destination scope data:', scopeError);
      } finally {
        setScopeLoading(false);
      }
    })();

    scopeDataRequestRef.current = request;
    try {
      await request;
    } finally {
      scopeDataRequestRef.current = null;
    }
  }, [tenantSlug]);

  const loadDestinations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const destinationsRes = await fetch(`/api/${tenantSlug}/destinations`);
      if (!destinationsRes.ok) {
        const payload = await destinationsRes.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load destinations.');
      }

      const destinationRows = await destinationsRes.json().catch(() => []);
      setDestinations(Array.isArray(destinationRows) ? destinationRows : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load destinations.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    scopeDataReadyRef.current = false;
    scopeDataRequestRef.current = null;
    setChannels([]);
    setMarkets([]);
    void loadDestinations();
    void fetchScopeData();
  }, [fetchScopeData, loadDestinations]);

  const activeChannels = useMemo(
    () => channels.filter((channel) => channel.is_active),
    [channels]
  );
  const activeMarkets = useMemo(
    () => markets.filter((market) => market.is_active),
    [markets]
  );
  const channelNameById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel.name])),
    [channels]
  );
  const marketNameById = useMemo(
    () => new Map(markets.map((market) => [market.id, market.name])),
    [markets]
  );

  const fallbackReadOnly = useMemo(
    () => destinations.some((destination) => isFallbackDestination(destination)),
    [destinations]
  );

  const filteredDestinations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return destinations;
    return destinations.filter((destination) => {
      const channelName = destination.channel_id ? channelNameById.get(destination.channel_id) || '' : '';
      const marketName = destination.market_id ? marketNameById.get(destination.market_id) || '' : '';
      return `${destination.name} ${destination.code} ${channelName} ${marketName}`
        .toLowerCase()
        .includes(query);
    });
  }, [channelNameById, destinations, marketNameById, search]);

  const openCreate = () => {
    void fetchScopeData();
    setError(null);
    setSelectedDestination(null);
    setDraft({
      ...EMPTY_DRAFT,
      channel_id: activeChannels[0]?.id || '',
    });
    setCreateOpen(true);
  };

  const openManage = (destination: DestinationRecord) => {
    void fetchScopeData();
    setError(null);
    setSelectedDestination(destination);
    setDraft({
      name: destination.name,
      code: destination.code,
      description: destination.description || '',
      channel_id: destination.channel_id || '',
      market_id: destination.market_id || '',
      sort_order: String(destination.sort_order ?? 0),
      is_active: destination.is_active,
    });
    setManageOpen(true);
  };

  const createDestination = async () => {
    const name = draft.name.trim();
    const code = draft.code.trim() || generateCode(name);
    const channelId = draft.channel_id.trim();
    if (!name || !code || !channelId) return;

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/destinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          description: draft.description.trim() || null,
          channel_id: channelId,
          market_id: draft.market_id || null,
          sort_order: Number.parseInt(draft.sort_order, 10) || 0,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create destination.');
      }
      setCreateOpen(false);
      await loadDestinations();
      notifyMarketContextRefresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create destination.');
    } finally {
      setSaving(false);
    }
  };

  const updateDestination = async () => {
    if (!selectedDestination) return;
    const name = draft.name.trim();
    const code = draft.code.trim() || generateCode(name);
    const channelId = draft.channel_id.trim();
    if (!name || !code || !channelId) return;

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/destinations/${selectedDestination.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          description: draft.description.trim() || null,
          channel_id: channelId,
          market_id: draft.market_id || null,
          sort_order: Number.parseInt(draft.sort_order, 10) || 0,
          is_active: draft.is_active,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update destination.');
      }
      setManageOpen(false);
      await loadDestinations();
      notifyMarketContextRefresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update destination.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading destinations..." size="lg" />
      </div>
    );
  }

  return (
    <>
      <SettingsPageContent page="destinations">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Destinations</h1>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {fallbackReadOnly ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Destinations are in fallback mode (derived from channels) and are read-only until full
            destination migrations are applied.
          </div>
        ) : null}

        <section className="space-y-4 rounded-lg border border-border/60 bg-card p-6">
          {scopeLoading ? (
            <div className="text-xs text-muted-foreground">Loading channels and markets...</div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search destinations..."
              className="max-w-sm"
            />
          </div>

          <ItemList
            items={filteredDestinations}
            getKey={(destination) => destination.id}
            renderTitle={(destination) => destination.name}
            renderSubtitle={(destination) => {
              const channelLabel = destination.channel_id
                ? channelNameById.get(destination.channel_id) || 'Unknown channel'
                : 'No channel';
              const marketLabel = destination.market_id
                ? marketNameById.get(destination.market_id) || 'Unknown market'
                : 'Global market';
              return `${destination.code} - ${channelLabel} - ${marketLabel}`;
            }}
            getStatus={(destination) => (destination.is_active ? 'active' : 'inactive')}
            renderRight={(destination) => (
              isFallbackDestination(destination) ? <Badge variant="neutral">Fallback</Badge> : null
            )}
            onClickItem={openManage}
            isLocked={(destination) => fallbackReadOnly || isFallbackDestination(destination)}
            emptyMessage={search ? 'No destinations match your search.' : 'No destinations configured yet.'}
            headerLabel="destinations"
            onCreate={fallbackReadOnly ? undefined : openCreate}
            createLabel="Add destination"
          />
        </section>
      </SettingsPageContent>

      <FullscreenFormModal
        open={createOpen}
        title="Add Destination"
        onOpenChange={(open) => !saving && setCreateOpen(open)}
        onBack={() => !saving && setCreateOpen(false)}
        primaryActionLabel="Create Destination"
        onPrimaryAction={() => void createDestination()}
        primaryActionDisabled={saving || !draft.name.trim() || !draft.channel_id}
        primaryActionLoading={saving}
        primaryActionLoadingLabel="Creating..."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="destination-create-name" className="text-sm font-medium text-foreground">
              Name
            </label>
            <Input
              id="destination-create-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="destination-create-code" className="text-sm font-medium text-foreground">
              Code (optional)
            </label>
            <Input
              id="destination-create-code"
              value={draft.code}
              onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Channel</label>
            <Select
              value={draft.channel_id || NONE_VALUE}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, channel_id: value === NONE_VALUE ? '' : value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Select channel</SelectItem>
                {activeChannels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Market (optional)</label>
            <Select
              value={draft.market_id || NONE_VALUE}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, market_id: value === NONE_VALUE ? '' : value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Global market" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Global</SelectItem>
                {activeMarkets.map((market) => (
                  <SelectItem key={market.id} value={market.id}>
                    {market.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="destination-create-order" className="text-sm font-medium text-foreground">
              Sort order
            </label>
            <Input
              id="destination-create-order"
              type="number"
              value={draft.sort_order}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sort_order: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="destination-create-description" className="text-sm font-medium text-foreground">
              Description (optional)
            </label>
            <Input
              id="destination-create-description"
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>
        </div>
      </FullscreenFormModal>

      <FullscreenFormModal
        open={manageOpen}
        title="Manage Destination"
        onOpenChange={(open) => !saving && setManageOpen(open)}
        onBack={() => !saving && setManageOpen(false)}
        primaryActionLabel="Save Changes"
        onPrimaryAction={() => void updateDestination()}
        primaryActionDisabled={
          saving ||
          !draft.name.trim() ||
          !draft.channel_id ||
          fallbackReadOnly ||
          (selectedDestination ? isFallbackDestination(selectedDestination) : false)
        }
        primaryActionLoading={saving}
        primaryActionLoadingLabel="Saving..."
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="destination-manage-name" className="text-sm font-medium text-foreground">
              Name
            </label>
            <Input
              id="destination-manage-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              disabled={fallbackReadOnly || (selectedDestination ? isFallbackDestination(selectedDestination) : false)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="destination-manage-code" className="text-sm font-medium text-foreground">
              Code
            </label>
            <Input
              id="destination-manage-code"
              value={draft.code}
              onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
              disabled={fallbackReadOnly || (selectedDestination ? isFallbackDestination(selectedDestination) : false)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Channel</label>
            <Select
              value={draft.channel_id || NONE_VALUE}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, channel_id: value === NONE_VALUE ? '' : value }))
              }
              disabled={fallbackReadOnly || (selectedDestination ? isFallbackDestination(selectedDestination) : false)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Select channel</SelectItem>
                {activeChannels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Market (optional)</label>
            <Select
              value={draft.market_id || NONE_VALUE}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, market_id: value === NONE_VALUE ? '' : value }))
              }
              disabled={fallbackReadOnly || (selectedDestination ? isFallbackDestination(selectedDestination) : false)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Global market" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Global</SelectItem>
                {activeMarkets.map((market) => (
                  <SelectItem key={market.id} value={market.id}>
                    {market.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="destination-manage-order" className="text-sm font-medium text-foreground">
              Sort order
            </label>
            <Input
              id="destination-manage-order"
              type="number"
              value={draft.sort_order}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sort_order: event.target.value }))
              }
              disabled={fallbackReadOnly || (selectedDestination ? isFallbackDestination(selectedDestination) : false)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="destination-manage-description" className="text-sm font-medium text-foreground">
              Description
            </label>
            <Input
              id="destination-manage-description"
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              disabled={fallbackReadOnly || (selectedDestination ? isFallbackDestination(selectedDestination) : false)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive destinations are hidden from scope selectors.
              </p>
            </div>
            <Switch
              checked={draft.is_active}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, is_active: checked }))
              }
              disabled={fallbackReadOnly || (selectedDestination ? isFallbackDestination(selectedDestination) : false)}
            />
          </div>
        </div>
      </FullscreenFormModal>
    </>
  );
}

