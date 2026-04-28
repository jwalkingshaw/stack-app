import OutputProfileDetail from '../../components/OutputProfileDetail';

export default async function OutputProfileDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; profileId: string }>;
}) {
  const { tenant, profileId } = await params;
  return <OutputProfileDetail tenantSlug={tenant} profileId={profileId} />;
}
