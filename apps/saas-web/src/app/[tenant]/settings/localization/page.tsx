import LocalizationHome from '../components/LocalizationHome';

interface LocalizationPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationPage({ params }: LocalizationPageProps) {
  const { tenant } = await params;

  return <LocalizationHome tenantSlug={tenant} />;
}
