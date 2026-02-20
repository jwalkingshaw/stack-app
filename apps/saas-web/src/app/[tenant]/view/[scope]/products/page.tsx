import { ProductsClient } from "../../../products/ProductsClient";

interface ScopedProductsPageProps {
  params: Promise<{ tenant: string; scope: string }>;
}

function normalizeSelectedBrand(scope: string, tenant: string): string | null {
  const normalizedScope = scope.trim().toLowerCase();
  const normalizedTenant = tenant.trim().toLowerCase();
  if (
    !normalizedScope ||
    normalizedScope === "self" ||
    normalizedScope === "all" ||
    normalizedScope === normalizedTenant
  ) {
    return null;
  }
  return normalizedScope;
}

export default async function ScopedProductsPage({ params }: ScopedProductsPageProps) {
  const resolvedParams = await params;
  const tenantSlug = resolvedParams.tenant;
  const selectedBrandSlug = normalizeSelectedBrand(resolvedParams.scope, tenantSlug);

  return <ProductsClient tenantSlug={tenantSlug} selectedBrandSlug={selectedBrandSlug} />;
}

