import { Suspense } from 'react';
import FieldGroupsSettings from '../components/FieldGroupsSettings';
import { PageLoader } from '@/components/ui/loading-spinner';

interface FieldGroupsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function FieldGroupsPage({ params }: FieldGroupsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageLoader text="Loading groups..." size="lg" />
    }>
      <FieldGroupsSettings tenantSlug={tenant} />
    </Suspense>
  );
}
