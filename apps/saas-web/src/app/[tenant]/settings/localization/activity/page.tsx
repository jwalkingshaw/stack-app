import { Suspense } from 'react';
import LocalizationSettings from '../../components/LocalizationSettings';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

interface LocalizationActivityPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationActivityPage({ params }: LocalizationActivityPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={<PageSkeleton text="Loading translation activity..." size="lg" />}>
      <LocalizationSettings tenantSlug={tenant} focusOverride="jobs" />
    </Suspense>
  );
}

