import { Suspense } from 'react';
import MarketsSettings from '../components/MarketsSettings';
import { PageLoader } from '@/components/ui/loading-spinner';

interface MarketsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function MarketsPage({ params }: MarketsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageLoader text="Loading markets..." size="lg" />
    }>
      <MarketsSettings tenantSlug={tenant} />
    </Suspense>
  );
}
