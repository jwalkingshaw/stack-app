import { VariantDetailClient } from "../../../../../../products/[productId]/variants/[variantId]/VariantDetailClient";

interface ScopedVariantDetailPageProps {
  params: Promise<{
    tenant: string;
    scope: string;
    productId: string;
    variantId: string;
  }>;
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

export default async function ScopedVariantDetailPage({ params }: ScopedVariantDetailPageProps) {
  const resolvedParams = await params;
  const selectedBrandSlug = normalizeSelectedBrand(
    resolvedParams.scope,
    resolvedParams.tenant
  );

  return (
    <VariantDetailClient
      tenantSlug={resolvedParams.tenant}
      productId={resolvedParams.productId}
      variantId={resolvedParams.variantId}
      selectedBrandSlug={selectedBrandSlug}
    />
  );
}
