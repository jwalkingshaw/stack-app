'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/loading-spinner';
import { PageContentContainer } from '@/components/ui/page-content-container';

interface DestinationsSettingsProps {
  tenantSlug: string;
}

interface Destination {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  channel_id: string | null;
  market_id: string | null;
  sort_order: number;
}

interface Channel {
  id: string;
  code: string;
  name: string;
}

interface Market {
  id: string;
  code: string;
  name: string;
}

const generateCode = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

export default function DestinationsSettings({ tenantSlug }: DestinationsSettingsProps) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [destinationName, setDestinationName] = useState('');
  const [destinationCode, setDestinationCode] = useState('');
  const [destinationDescription, setDestinationDescription] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [destinationsRes, channelsRes, marketsRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/destinations`),
        fetch(`/api/${tenantSlug}/channels`),
        fetch(`/api/${tenantSlug}/markets`),
      ]);

      if (!destinationsRes.ok) {
        const payload = await destinationsRes.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to fetch destinations');
      }
      if (!channelsRes.ok) {
        throw new Error('Failed to fetch channels');
      }
      if (!marketsRes.ok) {
        throw new Error('Failed to fetch markets');
      }

      const [destinationRows, channelRows, marketRows] = await Promise.all([
        destinationsRes.json(),
        channelsRes.json(),
        marketsRes.json(),
      ]);

      setDestinations((destinationRows || []) as Destination[]);
      setChannels((channelRows || []) as Channel[]);
      setMarkets((marketRows || []) as Market[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load destination settings');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const channelNameById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel.name])),
    [channels]
  );
  const marketNameById = useMemo(
    () => new Map(markets.map((market) => [market.id, market.name])),
    [markets]
  );

  const hasFallbackDestinations = useMemo(
    () => destinations.some((destination) => destination.id.startsWith('channel-')),
    [destinations]
  );

  const handleCreateDestination = async () => {
    const name = destinationName.trim();
    if (!name) return;

    const code = destinationCode.trim() || generateCode(name);
    const description = destinationDescription.trim();

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/destinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          description: description || null,
          channel_id: selectedChannelId || null,
          market_id: selectedMarketId || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create destination');
      }

      setDestinationName('');
      setDestinationCode('');
      setDestinationDescription('');
      setSelectedChannelId('');
      setSelectedMarketId('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create destination');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (destination: Destination) => {
    if (destination.id.startsWith('channel-')) return;

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/destinations/${destination.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !destination.is_active }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update destination');
      }

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update destination');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageLoader text="Loading destinations..." size="lg" />
      </div>
    );
  }

  return (
    <PageContentContainer mode="content" className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Destinations</h1>
        <p className="text-sm text-muted-foreground">
          Define specific publishing endpoints inside channels and markets.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {hasFallbackDestinations && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Destinations are currently in fallback mode (derived from channels). Apply migrations to enable full
          destination management.
        </div>
      )}

      <section className="space-y-4 rounded-lg border border-border/60 bg-card p-6">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Add Destination</h2>
          <p className="text-sm text-muted-foreground">
            Example: Amazon US, Walmart US, Lazada SG, Shopee MY.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Destination name"
            value={destinationName}
            onChange={(event) => setDestinationName(event.target.value)}
          />
          <Input
            placeholder="Code (optional)"
            value={destinationCode}
            onChange={(event) => setDestinationCode(event.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={destinationDescription}
            onChange={(event) => setDestinationDescription(event.target.value)}
            className="sm:col-span-2"
          />
          <select
            className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={selectedChannelId}
            onChange={(event) => setSelectedChannelId(event.target.value)}
          >
            <option value="">Any channel</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={selectedMarketId}
            onChange={(event) => setSelectedMarketId(event.target.value)}
          >
            <option value="">Any market</option>
            {markets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.name}
              </option>
            ))}
          </select>
          <Button
            variant="accent-blue"
            onClick={handleCreateDestination}
            disabled={saving || !destinationName.trim()}
            className="sm:col-span-2"
          >
            Add destination
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border/60 bg-card p-6">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Destination List</h2>
          <p className="text-sm text-muted-foreground">Enable or disable destination availability.</p>
        </header>

        {destinations.length === 0 ? (
          <div className="text-sm text-muted-foreground">No destinations configured yet.</div>
        ) : (
          <div className="space-y-2">
            {destinations.map((destination) => (
              <div
                key={destination.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{destination.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {destination.code}
                    {destination.channel_id
                      ? ` | Channel: ${channelNameById.get(destination.channel_id) || 'Unknown'}`
                      : ''}
                    {destination.market_id
                      ? ` | Market: ${marketNameById.get(destination.market_id) || 'Unknown'}`
                      : ''}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {!destination.is_active && <Badge variant="secondary">Inactive</Badge>}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleToggleActive(destination)}
                    disabled={saving || destination.id.startsWith('channel-')}
                  >
                    {destination.id.startsWith('channel-')
                      ? 'Fallback'
                      : destination.is_active
                      ? 'Disable'
                      : 'Enable'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageContentContainer>
  );
}
