'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ItemList } from '@/components/ui/item-list';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { CenteredFormModal, FullscreenFormModal } from '@/components/ui/modal-shells';
import { Switch } from '@/components/ui/switch';
import { SettingsPageContent } from './settings-page-content';

interface ChannelsSettingsProps {
  tenantSlug: string;
}

interface ChannelRecord {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

type ChannelDraft = {
  name: string;
  code: string;
  is_active: boolean;
};

const INITIAL_DRAFT: ChannelDraft = {
  name: '',
  code: '',
  is_active: true,
};

const generateCode = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

const notifyMarketContextRefresh = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('market-context:refresh'));
};

export default function ChannelsSettings({ tenantSlug }: ChannelsSettingsProps) {
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelRecord | null>(null);
  const [draft, setDraft] = useState<ChannelDraft>(INITIAL_DRAFT);

  const loadChannels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/channels`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load channels.');
      }
      const rows = (await response.json().catch(() => [])) as ChannelRecord[];
      setChannels(Array.isArray(rows) ? rows : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load channels.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const filteredChannels = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return channels;
    return channels.filter((channel) =>
      `${channel.name} ${channel.code}`.toLowerCase().includes(query)
    );
  }, [channels, search]);

  const openCreate = () => {
    setError(null);
    setDraft(INITIAL_DRAFT);
    setSelectedChannel(null);
    setCreateOpen(true);
  };

  const openManage = (channel: ChannelRecord) => {
    setError(null);
    setSelectedChannel(channel);
    setDraft({
      name: channel.name,
      code: channel.code,
      is_active: channel.is_active,
    });
    setManageOpen(true);
  };

  const createChannel = async () => {
    const name = draft.name.trim();
    const code = draft.code.trim() || generateCode(name);
    if (!name || !code) return;

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create channel.');
      }
      setCreateOpen(false);
      await loadChannels();
      notifyMarketContextRefresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create channel.');
    } finally {
      setSaving(false);
    }
  };

  const updateChannel = async () => {
    if (!selectedChannel) return;
    const name = draft.name.trim();
    const code = draft.code.trim() || generateCode(name);
    if (!name || !code) return;

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/channels/${selectedChannel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          is_active: draft.is_active,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update channel.');
      }
      setManageOpen(false);
      await loadChannels();
      notifyMarketContextRefresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update channel.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading channels..." size="lg" variant="settings-page" />
      </div>
    );
  }

  return (
    <>
      <SettingsPageContent page="channels">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Channels</h1>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <section className="space-y-4 rounded-lg border border-border/60 bg-card p-6">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search channels..."
            className="max-w-sm"
          />

          <ItemList
            items={filteredChannels}
            getKey={(channel) => channel.id}
            renderTitle={(channel) => channel.name}
            renderSubtitle={(channel) => channel.code}
            getStatus={(channel) => (channel.is_active ? 'active' : 'inactive')}
            onClickItem={openManage}
            emptyMessage={search ? 'No channels match your search.' : 'No channels created yet.'}
            headerLabel="channels"
            onCreate={openCreate}
            createLabel="Add channel"
          />
        </section>
      </SettingsPageContent>

      <FullscreenFormModal
        open={createOpen}
        title="Add Channel"
        onOpenChange={(open) => !saving && setCreateOpen(open)}
        onBack={() => !saving && setCreateOpen(false)}
        primaryActionLabel="Create Channel"
        onPrimaryAction={() => void createChannel()}
        primaryActionDisabled={saving || !draft.name.trim()}
        primaryActionLoading={saving}
        primaryActionLoadingLabel="Creating..."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="channel-create-name" className="text-sm font-medium text-foreground">
              Name
            </label>
            <Input
              id="channel-create-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Channel name"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="channel-create-code" className="text-sm font-medium text-foreground">
              Code (optional)
            </label>
            <Input
              id="channel-create-code"
              value={draft.code}
              onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
              placeholder="channel_code"
            />
          </div>
        </div>
      </FullscreenFormModal>

      <CenteredFormModal
        open={manageOpen}
        title="Manage Channel"
        onOpenChange={(open) => !saving && setManageOpen(open)}
        onCancel={() => setManageOpen(false)}
        onPrimaryAction={() => void updateChannel()}
        primaryActionLabel="Save Changes"
        primaryActionDisabled={saving || !draft.name.trim()}
        primaryActionLoading={saving}
        primaryActionLoadingLabel="Saving..."
      >
        <div className="space-y-1.5">
          <label htmlFor="channel-manage-name" className="text-sm font-medium text-foreground">
            Name
          </label>
          <Input
            id="channel-manage-name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="channel-manage-code" className="text-sm font-medium text-foreground">
            Code
          </label>
          <Input
            id="channel-manage-code"
            value={draft.code}
            onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-foreground">Active</p>
            <p className="text-xs text-muted-foreground">
              Inactive channels are hidden from scope selectors.
            </p>
          </div>
          <Switch
            checked={draft.is_active}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, is_active: checked }))
            }
          />
        </div>
      </CenteredFormModal>
    </>
  );
}


