import { PartnerUpdateDetailClient } from "./PartnerUpdateDetailClient";

interface ScopedUpdateDetailPageProps {
  params: Promise<{ tenant: string; scope: string; updateId: string }>;
}

export default async function ScopedUpdateDetailPage({
  params,
}: ScopedUpdateDetailPageProps) {
  const resolvedParams = await params;
  return (
    <PartnerUpdateDetailClient
      tenantSlug={resolvedParams.tenant}
      scope={resolvedParams.scope}
      updateId={resolvedParams.updateId}
    />
  );
}
