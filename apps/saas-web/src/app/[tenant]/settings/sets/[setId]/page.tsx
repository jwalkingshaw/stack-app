import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import SetDetailSettings from '../../components/sets/SetDetailSettings';

interface SetDetailPageProps {
  params: Promise<{ tenant: string; setId: string }>;
}

export default async function SetDetailPage({ params }: SetDetailPageProps) {
  const { tenant, setId } = await params;

  return (
    <Suspense fallback={<PageSkeleton text="Loading set..." size="lg" />}>
      <SetDetailSettings tenantSlug={tenant} setId={setId} />
    </Suspense>
  );
}

