"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ProductDetailClient } from "./ProductDetailClient";

export default function ProductDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantSlug = params.tenant as string;
  const productId = params.productId as string;
  const selectedBrandSlug = (searchParams.get("brand") || "").trim().toLowerCase();

  return (
    <>
      <ProductDetailClient
        tenantSlug={tenantSlug}
        productId={productId}
        selectedBrandSlug={selectedBrandSlug || null}
      />
    </>
  );
}
