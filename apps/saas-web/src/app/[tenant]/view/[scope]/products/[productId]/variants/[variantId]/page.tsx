import { PublishedProductDetailClient } from "../../../PublishedProductDetailClient";

interface ScopedVariantDetailPageProps {
  params: Promise<{
    tenant: string;
    scope: string;
    productId: string;
    variantId: string;
  }>;
}

export default async function ScopedVariantDetailPage({ params }: ScopedVariantDetailPageProps) {
  const resolvedParams = await params;

  return (
    <PublishedProductDetailClient
      tenantSlug={resolvedParams.tenant}
      scope={resolvedParams.scope}
      productKey={resolvedParams.variantId}
      parentProductKey={resolvedParams.productId}
    />
  );
}
