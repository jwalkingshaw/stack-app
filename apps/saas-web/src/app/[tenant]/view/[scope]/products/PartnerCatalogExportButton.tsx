'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PartnerCatalogExportButtonProps {
  brandSlug: string;
  marketId?: string | null;
  localeId?: string | null;
  profile?: string | null;
  destination?: string | null;
  canExport?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
}

export function PartnerCatalogExportButton({
  brandSlug,
  marketId,
  localeId,
  profile,
  destination,
  canExport = true,
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
      const queryParams = new URLSearchParams();
      if (marketId) queryParams.set('market', marketId);
      if (localeId) queryParams.set('locale', localeId);
      if (profile) queryParams.set('profile', profile);
      if (destination) queryParams.set('destination', destination);
      queryParams.set('limit', '100');

      const response = await fetch(
        `/api/published/brands/${brandSlug}/catalog?${queryParams.toString()}`
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? 'Export failed');
      }

      const payload = await response.json();
      const filename = `catalog-${brandSlug}-${Date.now()}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
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
        disabled={loading || !canExport}
        onClick={() => void handleDownload()}
        className="gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        {loading ? 'Preparing...' : canExport ? label : 'View Only'}
      </Button>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !canExport ? (
        <p className="text-xs text-muted-foreground">This published view does not allow export.</p>
      ) : null}
    </div>
  );
}
