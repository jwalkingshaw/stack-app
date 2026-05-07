import { Suspense } from 'react';
import ProductFamiliesSettings from '../components/ProductFamiliesSettings';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

interface ProductFamiliesPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ProductFamiliesPage({ params }: ProductFamiliesPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageSkeleton text="Loading product families..." size="lg" variant="settings-page" />
    }>
      <ProductFamiliesSettings tenantSlug={tenant} />
    </Suspense>
  );
}
