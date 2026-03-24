import { Suspense } from 'react';
import LocalizationDefaultsSettings from '../../components/LocalizationDefaultsSettings';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

interface LocalizationDefaultsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationDefaultsPage({ params }: LocalizationDefaultsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={<PageSkeleton text="Loading localization defaults..." size="lg" />}>
      <LocalizationDefaultsSettings tenantSlug={tenant} />
    </Suspense>
  );
}

