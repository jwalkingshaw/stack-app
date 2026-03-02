import PartnerRelationshipClient from "../../../../team/PartnerRelationshipClient";

export default async function TeamPartnerDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; partnerOrganizationId: string }>;
}) {
  const resolvedParams = await params;

  return (
    <PartnerRelationshipClient
      tenantSlug={resolvedParams.tenant}
      partnerOrganizationId={resolvedParams.partnerOrganizationId}
    />
  );
}

