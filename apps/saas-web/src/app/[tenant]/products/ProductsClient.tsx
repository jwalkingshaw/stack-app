"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PIMTable } from "@/components/products/pim-table";
import { AddProductModal } from "@/components/products/add-product-modal";
import { PageHeader } from "@/components/ui/page-header";
import { getProductUrl } from "@/lib/product-utils";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";

interface ProductsClientProps {
  tenantSlug: string;
  selectedBrandSlug?: string | null;
  isPartnerAllView?: boolean;
}


export function ProductsClient({
  tenantSlug,
  selectedBrandSlug,
  isPartnerAllView = false,
}: ProductsClientProps) {
  const router = useRouter();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const normalizedTenantSlug = tenantSlug.trim().toLowerCase();
  const normalizedSelectedBrand = (selectedBrandSlug || "").trim().toLowerCase();
  const isSharedBrandView =
    Boolean(normalizedSelectedBrand) && normalizedSelectedBrand !== normalizedTenantSlug;

  const handleProductClick = (product: any) => {
    const unscopedUrl = getProductUrl(product, tenantSlug);
    const rowOrganizationSlug = String(
      product?.organizationSlug ?? product?.organization_slug ?? ""
    )
      .trim()
      .toLowerCase();
    const rowScope =
      isSharedBrandView
        ? normalizedSelectedBrand
        : isPartnerAllView && rowOrganizationSlug && rowOrganizationSlug !== normalizedTenantSlug
          ? rowOrganizationSlug
          : "";

    if (!rowScope) {
      router.push(unscopedUrl);
      return;
    }
    const scopeRoot = buildTenantPathForScope({
      tenantSlug,
      scope: rowScope,
    });
    const tenantPrefix = `/${tenantSlug}`;
    const scopedUrl = unscopedUrl.startsWith(tenantPrefix)
      ? `${scopeRoot}${unscopedUrl.slice(tenantPrefix.length)}`
      : unscopedUrl;
    router.push(scopedUrl);
  };

  const handleAddProduct = () => {
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Products" />
      {isSharedBrandView ? (
        <div className="mx-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Viewing shared products from <span className="font-medium text-foreground">{selectedBrandSlug}</span>.
          Creating products is disabled in shared view.
        </div>
      ) : isPartnerAllView ? (
        <div className="mx-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Viewing your products plus brand-shared products in one workspace.
          Shared brand records are read-only.
        </div>
      ) : null}

      <div className="p-6">
        <PIMTable
          tenantSlug={tenantSlug}
          selectedBrandSlug={selectedBrandSlug}
          isPartnerAllView={isPartnerAllView}
          onProductClick={handleProductClick}
          onCreateProduct={isSharedBrandView ? undefined : handleAddProduct}
        />

        {!isSharedBrandView ? (
          <AddProductModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            tenantSlug={tenantSlug}
          />
        ) : null}
      </div>
    </div>
  );
}
