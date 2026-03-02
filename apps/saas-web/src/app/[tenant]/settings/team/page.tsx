import TeamClient from '../../team/TeamClient';

export default async function SettingsTeamPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  return <TeamClient tenantSlug={resolvedParams.tenant} view="internal" />;
}
