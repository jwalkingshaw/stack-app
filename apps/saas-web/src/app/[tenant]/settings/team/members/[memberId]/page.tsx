import TeamMemberClient from "../../../../team/TeamMemberClient";

export default async function TeamMemberDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; memberId: string }>;
}) {
  const resolvedParams = await params;

  return (
    <TeamMemberClient
      tenantSlug={resolvedParams.tenant}
      memberId={resolvedParams.memberId}
    />
  );
}

