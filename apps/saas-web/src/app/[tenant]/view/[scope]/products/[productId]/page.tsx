import { PublishedProductDetailClient } from "../PublishedProductDetailClient";

interface ScopedProductDetailPageProps {
  params: Promise<{ tenant: string; scope: string; productId: string }>;
}

export default async function ScopedProductDetailPage({ params }: ScopedProductDetailPageProps) {
  const resolvedParams = await params;

  return (
    <PublishedProductDetailClient
      tenantSlug={resolvedParams.tenant}
      scope={resolvedParams.scope}
      productKey={resolvedParams.productId}
    />
  );
}
