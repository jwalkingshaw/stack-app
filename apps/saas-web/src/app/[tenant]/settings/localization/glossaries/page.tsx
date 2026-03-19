import { Suspense } from 'react';
import LocalizationGlossariesSettings from '../../components/LocalizationGlossariesSettings';
import { PageLoader } from '@/components/ui/loading-spinner';

interface LocalizationGlossariesPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationGlossariesPage({ params }: LocalizationGlossariesPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={<PageLoader text="Loading glossaries..." size="lg" />}>
      <LocalizationGlossariesSettings tenantSlug={tenant} />
    </Suspense>
  );
}
