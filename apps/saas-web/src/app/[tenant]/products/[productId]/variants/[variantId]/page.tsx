"use client";

import { useParams, useSearchParams } from "next/navigation";
import { VariantDetailClient } from "./VariantDetailClient";

export default function VariantDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantSlug = params.tenant as string;
  const productId = params.productId as string;
  const variantId = params.variantId as string;
  const selectedBrandSlug = (searchParams.get("brand") || "").trim().toLowerCase();

  return (
    <>
      <VariantDetailClient
        tenantSlug={tenantSlug}
        productId={productId}
        variantId={variantId}
        selectedBrandSlug={selectedBrandSlug || null}
      />
    </>
  );
}
