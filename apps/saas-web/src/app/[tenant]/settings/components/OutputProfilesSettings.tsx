'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, ShoppingCart, Store, FileOutput, Plug, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { DeleteConfirmDialog, FullscreenFormModal } from '@/components/ui/modal-shells';
import { SettingsPageContent } from './settings-page-content';
import { ItemList } from '@/components/ui/item-list';
import { readApiData, readApiError } from '@/lib/api-contract';

const PROFILE_TYPE_LABELS: Record<string, string> = {
  portal:      'Partner Portal',
  marketplace: 'Marketplace',
  retail:      'Retail',
  export:      'Export / File',
  api:         'API Integration',
};

const PROFILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  portal:      <Globe className="h-3.5 w-3.5" />,
  marketplace: <ShoppingCart className="h-3.5 w-3.5" />,
  retail:      <Store className="h-3.5 w-3.5" />,
  export:      <FileOutput className="h-3.5 w-3.5" />,
  api:         <Plug className="h-3.5 w-3.5" />,
};

type OutputProfile = {
  id: string;
  name: string;
  code: string;
  profile_type: string;
  description: string | null;
  market_id: string | null;
  is_active: boolean;
  sort_order: number;
  market?: { id: string; name: string; code: string } | null;
  field_rules?: Array<{ id: string; field_code: string; is_required: boolean }>;
};

interface OutputProfilesSettingsProps {
  tenantSlug: string;
}

export default function OutputProfilesSettings({ tenantSlug }: OutputProfilesSettingsProps) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<OutputProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<string>('portal');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(readApiError(payload, 'Failed to load channels'));
        return;
      }
      setProfiles(readApiData<OutputProfile[]>(payload, []));
    } catch {
      setError('Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) =>
      `${p.name} ${p.code} ${p.profile_type} ${p.market?.name ?? ''}`.toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) { setCreateError('Name is required'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          profile_type: createType,
          description: createDescription.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(readApiError(payload, 'Failed to create profile'));
        return;
      }
      closeCreateModal();
      await fetchProfiles();
    } catch {
      setCreateError('Failed to create profile');
    } finally {
      setCreating(false);
    }
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateError(null);
    setCreateName('');
    setCreateDescription('');
    setCreateType('portal');
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      await fetch(`/api/${tenantSlug}/output-profiles/${deleteTargetId}`, { method: 'DELETE' });
      setDeleteTargetId(null);
      await fetchProfiles();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  const deleteTarget = profiles.find((p) => p.id === deleteTargetId);

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading channels..." size="lg" />
      </div>
    );
  }

  return (
    <>
      <SettingsPageContent page="output-profiles">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Channels</h1>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="space-y-4 rounded-lg border border-border/60 bg-card p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels..."
              className="max-w-sm"
            />
          </div>

          <ItemList<OutputProfile>
            items={filteredProfiles}
            getKey={(p) => p.id}
            onClickItem={(p) => router.push(`/${tenantSlug}/settings/output-profiles/${p.id}`)}
            renderTitle={(p) => p.name}
            renderSubtitle={(p) => {
              const parts: string[] = [PROFILE_TYPE_LABELS[p.profile_type] ?? p.profile_type];
              if (p.market) parts.push(p.market.name);
              const requiredCount = p.field_rules?.filter((r) => r.is_required).length ?? 0;
              if (requiredCount > 0) parts.push(`${requiredCount} required fields`);
              return parts.join(' · ');
            }}
            getStatus={(p) => (p.is_active ? 'active' : 'inactive')}
            renderRight={(p) => (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {PROFILE_TYPE_ICONS[p.profile_type] ?? <Zap className="h-3.5 w-3.5" />}
                </span>
              </div>
            )}
            headerLabel="channels"
            onCreate={() => setIsCreateOpen(true)}
            createLabel="Add channel"
            emptyMessage="No channels configured. Add one to define where your products are published."
          />
        </section>
      </SettingsPageContent>

      {/* Create modal */}
      <FullscreenFormModal
        open={isCreateOpen}
        onOpenChange={(open) => { if (!open) closeCreateModal(); }}
        onBack={closeCreateModal}
        title="New Channel"
        onPrimaryAction={handleCreate}
        primaryActionLabel="Create Profile"
        primaryActionLoading={creating}
        primaryActionDisabled={!createName.trim()}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="e.g. Amazon, Retailer Portal, DTC Store"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              disabled={creating}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && createName.trim()) void handleCreate(); }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <Select value={createType} onValueChange={setCreateType} disabled={creating}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROFILE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {createType === 'portal' && 'A branded portal your retail partners log in to.'}
              {createType === 'marketplace' && 'A marketplace platform where your products are listed for sale.'}
              {createType === 'retail' && 'A retail chain or physical store network.'}
              {createType === 'export' && 'A scheduled file export — CSV, Excel, or XML feed.'}
              {createType === 'api' && 'A direct API push to a third-party system or integration.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Description{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              placeholder="e.g. Nightly flat file sync, portal for distributors..."
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              disabled={creating}
            />
          </div>
          {createError && <p className="text-sm text-destructive">{createError}</p>}
        </div>
      </FullscreenFormModal>

      {/* Delete confirmation — triggered from the detail page, not inline */}
      <DeleteConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title={`Delete "${deleteTarget?.name ?? 'profile'}"`}
        description="All field rules for this profile will be deleted. Product readiness scores against this profile will no longer be calculated."
        onConfirm={handleDelete}
        confirmLoading={deleting}
      />
    </>
  );
}
