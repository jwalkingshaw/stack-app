import { Suspense } from 'react';
import MarketsSettings from '../components/MarketsSettings';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

interface MarketsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function MarketsPage({ params }: MarketsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageSkeleton text="Loading markets..." size="lg" />
    }>
      <MarketsSettings tenantSlug={tenant} />
    </Suspense>
  );
}

