import { Suspense } from 'react';
import LocalizationGlossariesSettings from '../../components/LocalizationGlossariesSettings';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

interface LocalizationGlossariesPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationGlossariesPage({ params }: LocalizationGlossariesPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={<PageSkeleton text="Loading glossaries..." size="lg" />}>
      <LocalizationGlossariesSettings tenantSlug={tenant} />
    </Suspense>
  );
}

