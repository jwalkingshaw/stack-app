'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PartnerCatalogExportButtonProps {
  tenantSlug: string;
  scope: string;
  marketId?: string | null;
  localeId?: string | null;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
}

export function PartnerCatalogExportButton({
  tenantSlug,
  scope,
  marketId,
  localeId,
  variant = 'outline',
  size = 'sm',
  label = 'Download Catalog',
}: PartnerCatalogExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({ format: 'csv' });
      if (marketId) queryParams.set('marketId', marketId);
      if (localeId) queryParams.set('localeId', localeId);

      const response = await fetch(
        `/api/${tenantSlug}/view/${scope}/catalog/export?${queryParams.toString()}`
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? 'Export failed');
      }

      // Derive filename from Content-Disposition or build a fallback
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = filenameMatch?.[1] ?? `catalog-${scope}-${Date.now()}.csv`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        disabled={loading}
        onClick={() => void handleDownload()}
        className="gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        {loading ? 'Preparing...' : label}
      </Button>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
