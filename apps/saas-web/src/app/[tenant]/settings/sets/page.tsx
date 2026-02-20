import { Suspense } from 'react';
import { PageLoader } from '@/components/ui/loading-spinner';
import SetsSettings from '../components/SetsSettings';

interface SetsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function SetsPage({ params }: SetsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense
      fallback={<PageLoader text="Loading sets..." size="lg" />}
    >
      <SetsSettings tenantSlug={tenant} />
    </Suspense>
  );
}
