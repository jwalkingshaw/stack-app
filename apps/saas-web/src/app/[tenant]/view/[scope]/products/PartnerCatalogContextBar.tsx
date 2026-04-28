'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PartnerCatalogExportButton } from './PartnerCatalogExportButton';
import type {
  PublishedUpdatesResponse,
  PublishedWorkspaceResponse,
} from '@/lib/published-client';

interface PartnerCatalogContextBarProps {
  tenantSlug: string;
  scope: string;
  marketId?: string | null;
  localeId?: string | null;
  profile?: string | null;
}

function buildProductViewHref(params: {
  tenantSlug: string;
  scope: string;
  marketId?: string | null;
  localeId?: string | null;
  profile?: string | null;
}) {
  const query = new URLSearchParams();
  if (params.marketId) query.set('market', params.marketId);
  if (params.localeId) query.set('locale', params.localeId);
  if (params.profile) query.set('profile', params.profile);
  const suffix = query.toString();
  return `/${params.tenantSlug}/view/${params.scope}/products${suffix ? `?${suffix}` : ''}`;
}

export function PartnerCatalogContextBar({
  tenantSlug,
  scope,
  marketId,
  localeId,
  profile,
}: PartnerCatalogContextBarProps) {
  const [profiles, setProfiles] = useState<Array<{ code: string; name: string }>>([]);
  const [publishCount, setPublishCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!scope || scope === 'all') {
        setLoading(false);
        return;
      }

      try {
        const [workspaceResponse, updatesResponse] = await Promise.all([
          fetch('/api/published/workspace', { cache: 'no-store' }),
          fetch(`/api/published/brands/${scope}/updates`, { cache: 'no-store' }),
        ]);

        const workspacePayload = (await workspaceResponse.json().catch(() => null)) as
          | PublishedWorkspaceResponse
          | null;
        const updatesPayload = (await updatesResponse.json().catch(() => null)) as
          | PublishedUpdatesResponse
          | null;

        if (!active) return;

        const brand = workspacePayload?.brands.find((entry) => entry.slug === scope) ?? null;
        setProfiles(
          (brand?.profiles || []).map((entry) => ({
            code: entry.code,
            name: entry.name,
          }))
        );
        setPublishCount(Array.isArray(updatesPayload?.updates) ? updatesPayload.updates.length : 0);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [scope]);

  const activeProfile = useMemo(
    () => profiles.find((entry) => entry.code === profile) ?? null,
    [profile, profiles]
  );

  if (!scope || scope === 'all') return null;
  if (loading) {
    return <div className="mb-4 h-10 animate-pulse rounded-lg bg-muted" />;
  }
  if (profiles.length === 0 && publishCount === 0) return null;

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border/60 bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <span className="truncate font-medium text-foreground">
            {activeProfile?.name || 'Published Catalog'}
          </span>
          <span className="text-border">|</span>
          <span className="text-muted-foreground">
            {publishCount} published update{publishCount === 1 ? '' : 's'}
          </span>
        </div>

        <PartnerCatalogExportButton
          brandSlug={scope}
          marketId={marketId}
          localeId={localeId}
          profile={profile}
          canExport
          variant="outline"
          size="sm"
        />
      </div>

      {profiles.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Profiles</span>
          {profiles.map((entry) => {
            const isSelected = profile === entry.code || (!profile && entry.code === 'portal');
            return (
              <Link
                key={entry.code}
                href={buildProductViewHref({
                  tenantSlug,
                  scope,
                  marketId,
                  localeId,
                  profile: entry.code,
                })}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors ${
                  isSelected
                    ? 'border-foreground/15 bg-foreground text-background'
                    : 'border-border/70 bg-background text-foreground hover:bg-muted'
                }`}
              >
                {entry.name}
              </Link>
            );
          })}
          {profile && profiles.length > 1 ? (
            <Link
              href={buildProductViewHref({
                tenantSlug,
                scope,
                marketId,
                localeId,
              })}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear profile
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
