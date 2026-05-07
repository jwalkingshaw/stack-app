import { Suspense } from 'react';
import FieldGroupsSettings from '../components/FieldGroupsSettings';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

interface FieldGroupsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function FieldGroupsPage({ params }: FieldGroupsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageSkeleton text="Loading groups..." size="lg" variant="settings-page" />
    }>
      <FieldGroupsSettings tenantSlug={tenant} />
    </Suspense>
  );
}

