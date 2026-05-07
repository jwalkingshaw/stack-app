import { Suspense } from 'react';
import ProductFieldsSettings from '../components/ProductFieldsSettings';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

interface ProductFieldsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ProductFieldsPage({ params }: ProductFieldsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageSkeleton text="Loading attributes..." size="lg" variant="settings-page" />
    }>
      <ProductFieldsSettings tenantSlug={tenant} />
    </Suspense>
  );
}

