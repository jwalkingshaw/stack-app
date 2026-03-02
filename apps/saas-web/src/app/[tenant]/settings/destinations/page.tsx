import DestinationsSettings from '../components/DestinationsSettings';

export default async function DestinationsPage({
  params
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  return <DestinationsSettings tenantSlug={tenant} />;
}
