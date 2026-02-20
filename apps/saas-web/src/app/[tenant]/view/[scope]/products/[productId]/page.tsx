import { ProductDetailClient } from "../../../../products/[productId]/ProductDetailClient";

interface ScopedProductDetailPageProps {
  params: Promise<{ tenant: string; scope: string; productId: string }>;
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

export default async function ScopedProductDetailPage({ params }: ScopedProductDetailPageProps) {
  const resolvedParams = await params;
  const selectedBrandSlug = normalizeSelectedBrand(
    resolvedParams.scope,
    resolvedParams.tenant
  );

  return (
    <ProductDetailClient
      tenantSlug={resolvedParams.tenant}
      productId={resolvedParams.productId}
      selectedBrandSlug={selectedBrandSlug}
    />
  );
}
