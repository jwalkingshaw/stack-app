"use client";

import { useParams } from "next/navigation";
import { ProductsClient } from "./ProductsClient";

export default function ProductsPage() {
  const params = useParams();
  const tenantSlug = params.tenant as string;

  return (
    <>
      <ProductsClient tenantSlug={tenantSlug} />
    </>
  );
}