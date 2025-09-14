"use client";

import { useParams } from "next/navigation";
import { ProductDetailClient } from "./ProductDetailClient";

export default function ProductDetailPage() {
  const params = useParams();
  const tenantSlug = params.tenant as string;
  const productId = params.productId as string;

  return (
    <>
      <ProductDetailClient tenantSlug={tenantSlug} productId={productId} />
    </>
  );
}