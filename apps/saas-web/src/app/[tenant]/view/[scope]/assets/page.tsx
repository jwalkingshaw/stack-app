import { PublishedAssetsClient } from "./PublishedAssetsClient";

interface ScopedAssetsPageProps {
  params: Promise<{ tenant: string; scope: string }>;
}

export default async function ScopedAssetsPage({ params }: ScopedAssetsPageProps) {
  const resolvedParams = await params;

  return (
    <PublishedAssetsClient
      tenantSlug={resolvedParams.tenant}
      scope={resolvedParams.scope}
    />
  );
}
