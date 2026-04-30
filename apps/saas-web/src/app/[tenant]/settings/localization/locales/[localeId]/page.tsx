import LocalizationLocaleDetail from '../../../components/LocalizationLocaleDetail';

interface LocalizationLocalePageProps {
  params: Promise<{ tenant: string; localeId: string }>;
}

export default async function LocalizationLocalePage({ params }: LocalizationLocalePageProps) {
  const { tenant, localeId } = await params;
  return <LocalizationLocaleDetail tenantSlug={tenant} localeId={localeId} />;
}
