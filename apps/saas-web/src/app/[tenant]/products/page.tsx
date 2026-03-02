"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ProductsClient } from "./ProductsClient";
import {
  extractPartnerScopeFromPath,
  isReservedPartnerScope,
  PARTNER_SCOPE_ALL,
} from "@/lib/tenant-view-scope";

export default function ProductsPage() {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantSlug = params.tenant as string;
  const pathScope = extractPartnerScopeFromPath(pathname, tenantSlug);
  const isPartnerAllView = pathScope === PARTNER_SCOPE_ALL;
  const selectedBrandSlug = pathScope
    ? pathScope && !isReservedPartnerScope(pathScope)
      ? pathScope
      : ""
    : (searchParams.get("brand") || "").trim().toLowerCase();

  return (
    <>
      <ProductsClient
        tenantSlug={tenantSlug}
        selectedBrandSlug={selectedBrandSlug || null}
        isPartnerAllView={isPartnerAllView}
      />
    </>
  );
}
