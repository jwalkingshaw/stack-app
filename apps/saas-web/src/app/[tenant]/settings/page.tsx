import { Suspense } from 'react';
import SettingsClient from './SettingsClient';
import { PageLoader } from '@/components/ui/loading-spinner';

interface SettingsPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { tenant } = await params;

  return (
    <Suspense fallback={
      <PageLoader text="Loading settings..." size="lg" />
    }>
      <SettingsClient tenantSlug={tenant} />
    </Suspense>
  );
}