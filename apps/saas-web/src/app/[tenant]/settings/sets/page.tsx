import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import SetsSettings from '../components/SetsSettings';

interface SetsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function SetsPage({ params }: SetsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense
      fallback={<PageSkeleton text="Loading sets..." size="lg" />}
    >
      <SetsSettings tenantSlug={tenant} />
    </Suspense>
  );
}

