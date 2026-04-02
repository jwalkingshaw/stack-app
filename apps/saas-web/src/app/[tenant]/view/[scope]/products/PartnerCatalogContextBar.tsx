'use client';

import { useEffect, useState } from 'react';
import { PartnerCatalogExportButton } from './PartnerCatalogExportButton';

interface CatalogSummary {
  channel: { name: string; profile_type: string } | null;
  market: { id: string; name: string; code: string } | null;
  readiness: { total: number; ready: number } | null;
  productCount: number;
}

interface PartnerCatalogContextBarProps {
  tenantSlug: string;
  scope: string;
  marketId?: string | null;
  localeId?: string | null;
}

export function PartnerCatalogContextBar({
  tenantSlug,
  scope,
  marketId,
  localeId,
}: PartnerCatalogContextBarProps) {
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!scope || scope === 'all') {
      setLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (marketId) params.set('marketId', marketId);

    fetch(`/api/${tenantSlug}/view/${scope}/catalog/summary?${params.toString()}`)
      .then((r) => r.json())
      .then((payload: { success?: boolean; data?: CatalogSummary }) => {
        if (payload.success && payload.data) setSummary(payload.data);
      })
      .catch(() => { /* non-critical; bar just stays hidden */ })
      .finally(() => setLoading(false));
  }, [tenantSlug, scope, marketId]);

  // Don't render for "all brands" scope or while loading with nothing to show
  if (!scope || scope === 'all') return null;
  if (loading) {
    return (
      <div className="h-10 animate-pulse rounded-lg bg-muted mb-4" />
    );
  }
  if (!summary) return null;

  const { channel, readiness, productCount } = summary;

  // Nothing meaningful to show
  if (!channel && productCount === 0) return null;

  const readinessText = readiness
    ? `${readiness.ready} of ${readiness.total} products ready`
    : productCount > 0
    ? `${productCount} products`
    : null;

  const readinessColor =
    !readiness || readiness.total === 0
      ? 'text-muted-foreground'
      : readiness.ready === readiness.total
      ? 'text-green-600 dark:text-green-400'
      : readiness.ready / readiness.total >= 0.7
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-destructive';

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0 text-sm">
        {channel ? (
          <span className="font-medium text-foreground truncate">{channel.name}</span>
        ) : (
          <span className="text-muted-foreground">No channel assigned</span>
        )}
        {readinessText ? (
          <>
            <span className="text-border">·</span>
            <span className={readinessColor}>{readinessText}</span>
          </>
        ) : null}
      </div>

      <PartnerCatalogExportButton
        tenantSlug={tenantSlug}
        scope={scope}
        marketId={marketId}
        localeId={localeId}
        variant="outline"
        size="sm"
      />
    </div>
  );
}
