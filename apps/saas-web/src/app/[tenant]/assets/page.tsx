import AssetsClient from "./AssetsClient";

interface AssetsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function AssetsPage({ params }: AssetsPageProps) {
  const resolvedParams = await params
  const tenantSlug = resolvedParams.tenant

  // Server component - auth and organization data is already available from layout
  return (
    <AssetsClient tenantSlug={tenantSlug} />
  );
}