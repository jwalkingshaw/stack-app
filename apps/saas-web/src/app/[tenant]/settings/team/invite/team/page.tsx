import InviteWizardClient from "../InviteWizardClient";

export default async function InviteTeamMemberPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  return (
    <InviteWizardClient
      tenantSlug={resolvedParams.tenant}
      invitationType="team_member"
    />
  );
}

