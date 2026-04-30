import { PublishedCatalogClient } from "./PublishedCatalogClient";

interface ScopedProductsPageProps {
  params: Promise<{ tenant: string; scope: string }>;
}

export default async function ScopedProductsPage({ params }: ScopedProductsPageProps) {
  const resolvedParams = await params;

  return (
    <PublishedCatalogClient tenantSlug={resolvedParams.tenant} scope={resolvedParams.scope} />
  );
}
