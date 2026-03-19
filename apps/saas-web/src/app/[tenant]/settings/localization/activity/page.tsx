import { Suspense } from 'react';
import LocalizationSettings from '../../components/LocalizationSettings';
import { PageLoader } from '@/components/ui/loading-spinner';

interface LocalizationActivityPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationActivityPage({ params }: LocalizationActivityPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={<PageLoader text="Loading translation activity..." size="lg" />}>
      <LocalizationSettings tenantSlug={tenant} focusOverride="jobs" />
    </Suspense>
  );
}
