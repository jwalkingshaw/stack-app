import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import MarketDetailSettings from '../../components/markets/MarketDetailSettings';

interface MarketDetailPageProps {
  params: Promise<{ tenant: string; marketId: string }>;
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { tenant, marketId } = await params;

  return (
    <Suspense
      fallback={
        <PageSkeleton text="Loading market..." size="lg" variant="settings-detail" />
      }
    >
      <MarketDetailSettings tenantSlug={tenant} marketId={marketId} />
    </Suspense>
  );
}

