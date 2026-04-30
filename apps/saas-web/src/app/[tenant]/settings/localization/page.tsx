import LocalizationLocalesIndex from '../components/LocalizationLocalesIndex';

interface LocalizationPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationPage({ params }: LocalizationPageProps) {
  const { tenant } = await params;

  return <LocalizationLocalesIndex tenantSlug={tenant} />;
}
