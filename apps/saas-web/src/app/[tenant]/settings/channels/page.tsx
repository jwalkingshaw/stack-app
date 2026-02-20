import ChannelsSettings from '../components/ChannelsSettings';

export default async function ChannelsPage({
  params
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  return <ChannelsSettings tenantSlug={tenant} />;
}
