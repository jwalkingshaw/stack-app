import FoldersClient from "./FoldersClient";

interface FoldersPageProps {
  params: Promise<{ tenant: string }>
}

export default async function FoldersPage({ params }: FoldersPageProps) {
  const resolvedParams = await params
  const tenantSlug = resolvedParams.tenant

  // Server component - auth and organization data is already available from layout
  return (
    <FoldersClient tenantSlug={tenantSlug} />
  );
}