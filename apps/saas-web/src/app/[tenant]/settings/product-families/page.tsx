import { Suspense } from 'react';
import ProductFamiliesSettings from '../components/ProductFamiliesSettings';
import { PageLoader } from '@/components/ui/loading-spinner';

interface ProductFamiliesPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ProductFamiliesPage({ params }: ProductFamiliesPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageLoader text="Loading product families..." size="lg" />
    }>
      <ProductFamiliesSettings tenantSlug={tenant} />
    </Suspense>
  );
}