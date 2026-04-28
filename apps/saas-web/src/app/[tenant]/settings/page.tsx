import { Suspense } from 'react';
import SettingsClient from './SettingsClient';
import { PageSkeleton } from '@/components/ui/loading-skeleton';

interface SettingsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageSkeleton text="Loading settings..." size="lg" />
    }>
      <SettingsClient tenantSlug={tenant} />
    </Suspense>
  );
}
