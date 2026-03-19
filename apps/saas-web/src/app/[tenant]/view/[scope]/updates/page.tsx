import { PartnerUpdatesClient } from "./PartnerUpdatesClient";

interface ScopedUpdatesPageProps {
  params: Promise<{ tenant: string; scope: string }>;
}

export default async function ScopedUpdatesPage({ params }: ScopedUpdatesPageProps) {
  const resolvedParams = await params;
  return (
    <PartnerUpdatesClient
      tenantSlug={resolvedParams.tenant}
      scope={resolvedParams.scope}
    />
  );
}
