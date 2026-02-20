import { Suspense } from 'react';
import ProductFieldsSettings from '../components/ProductFieldsSettings';
import { PageLoader } from '@/components/ui/loading-spinner';

interface ProductFieldsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ProductFieldsPage({ params }: ProductFieldsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageLoader text="Loading attributes..." size="lg" />
    }>
      <ProductFieldsSettings tenantSlug={tenant} />
    </Suspense>
  );
}
