import { Suspense } from 'react';
import LocalizationSettings from '../components/LocalizationSettings';
import { PageLoader } from '@/components/ui/loading-spinner';

interface LocalizationPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationPage({ params }: LocalizationPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={<PageLoader text="Loading localization..." size="lg" />}>
      <LocalizationSettings tenantSlug={tenant} />
    </Suspense>
  );
}
