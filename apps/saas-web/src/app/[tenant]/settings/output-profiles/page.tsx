import OutputProfilesSettings from '../components/OutputProfilesSettings';

export default async function OutputProfilesPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return <OutputProfilesSettings tenantSlug={tenant} />;
}
