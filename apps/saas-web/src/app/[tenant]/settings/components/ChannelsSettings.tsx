'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/loading-spinner';
import { PageContentContainer } from '@/components/ui/page-content-container';

interface ChannelsSettingsProps {
  tenantSlug: string;
}

interface Channel {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const generateCode = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

export default function ChannelsSettings({ tenantSlug }: ChannelsSettingsProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelName, setChannelName] = useState('');
  const [channelCode, setChannelCode] = useState('');

  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/channels`);
      if (!response.ok) {
        throw new Error('Failed to fetch channels');
      }

      const data = await response.json();
      setChannels(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleCreateChannel = async () => {
    const name = channelName.trim();
    if (!name) return;

    const code = channelCode.trim() || generateCode(name);

    try {
      setSaving(true);
      const response = await fetch(`/api/${tenantSlug}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create channel');
      }

      setChannelName('');
      setChannelCode('');
      await fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      setSaving(true);
      const response = await fetch(`/api/${tenantSlug}/channels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update channel');
      }

      await fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageLoader text="Loading channels..." size="lg" />
      </div>
    );
  }

  return (
    <PageContentContainer mode="content" className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Channels</h1>
        <p className="text-sm text-muted-foreground">
          Define where product content is distributed.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="space-y-4 rounded-lg border border-border/60 bg-card p-6">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Channel List</h2>
          <p className="text-sm text-muted-foreground">Add, enable, or disable channels.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Channel name"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
          />
          <Input
            placeholder="Code (optional)"
            value={channelCode}
            onChange={(e) => setChannelCode(e.target.value)}
          />
          <Button variant="accent-blue" onClick={handleCreateChannel} disabled={saving || !channelName.trim()}>
            Add channel
          </Button>
        </div>

        <div className="space-y-2">
          {channels.length === 0 && (
            <div className="text-sm text-muted-foreground">No channels created yet.</div>
          )}
          {channels.map((channel) => (
            <div key={channel.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-foreground">{channel.name}</div>
                <div className="text-xs text-muted-foreground">{channel.code}</div>
              </div>
              <div className="flex items-center gap-3">
                {!channel.is_active && <Badge variant="secondary">Inactive</Badge>}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleActive(channel.id, channel.is_active)}
                  disabled={saving}
                >
                  {channel.is_active ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </PageContentContainer>
  );
}
