'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { CenteredFormModal, DeleteConfirmDialog } from '@/components/ui/modal-shells';
import { SettingsPageContent } from './settings-page-content';
import { ItemList } from '@/components/ui/item-list';
import { readApiData, readApiError } from '@/lib/api-contract';

const PROFILE_TYPE_LABELS: Record<string, string> = {
  portal: 'Portal',
};

const PROFILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  portal: <Globe className="h-3.5 w-3.5" />,
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
      setProfiles(
        readApiData<OutputProfile[]>(payload, []).filter(
          (profile) => profile.profile_type === 'portal'
        )
      );
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
          profile_type: 'portal',
          description: createDescription.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(readApiError(payload, 'Failed to create channel'));
        return;
      }
      closeCreateModal();
      await fetchProfiles();
    } catch {
      setCreateError('Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateError(null);
    setCreateName('');
    setCreateDescription('');
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
        <PageSkeleton text="Loading channels..." size="lg" variant="settings-page" />
      </div>
    );
  }

  return (
    <>
      <SettingsPageContent page="output-profiles">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Channels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the channels you publish product content to. The Partner Portal is the active channel at launch.
          </p>
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
              return parts.join(' - ');
            }}
            getStatus={(p) => (p.is_active ? 'active' : 'inactive')}
            renderRight={(p) => (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {PROFILE_TYPE_ICONS[p.profile_type] ?? <Globe className="h-3.5 w-3.5" />}
                </span>
              </div>
            )}
            headerLabel="channels"
            emptyMessage="No channels configured. Create a Portal channel to get started."
            onCreate={() => { setCreateError(null); setIsCreateOpen(true); }}
            createLabel="Add channel"
          />
        </section>
      </SettingsPageContent>

      {/* Create modal */}
      <CenteredFormModal
        open={isCreateOpen}
        title="New Channel"
        onOpenChange={(open) => { if (!open) closeCreateModal(); }}
        onCancel={closeCreateModal}
        onPrimaryAction={() => void handleCreate()}
        primaryActionLabel="Add channel"
        primaryActionLoading={creating}
        primaryActionDisabled={creating || !createName.trim()}
        primaryActionLoadingLabel="Adding..."
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Name</label>
          <Input
            placeholder="e.g. US Portal, Partner Portal"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            disabled={creating}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && createName.trim()) void handleCreate(); }}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            placeholder="e.g. Portal for US distributors and retailers"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            disabled={creating}
          />
        </div>
        {createError && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {createError}
          </div>
        )}
      </CenteredFormModal>

      {/* Delete confirmation — triggered from the detail page, not inline */}
      <DeleteConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title={`Delete "${deleteTarget?.name ?? 'channel'}"`}
        description="All field rules for this channel will be deleted. Product readiness scores against it will no longer be calculated."
        onConfirm={handleDelete}
        confirmLoading={deleting}
      />
    </>
  );
}
