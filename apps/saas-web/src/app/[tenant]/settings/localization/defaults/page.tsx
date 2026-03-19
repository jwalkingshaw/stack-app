import { Suspense } from 'react';
import LocalizationDefaultsSettings from '../../components/LocalizationDefaultsSettings';
import { PageLoader } from '@/components/ui/loading-spinner';

interface LocalizationDefaultsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationDefaultsPage({ params }: LocalizationDefaultsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={<PageLoader text="Loading localization defaults..." size="lg" />}>
      <LocalizationDefaultsSettings tenantSlug={tenant} />
    </Suspense>
  );
}
