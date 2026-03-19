"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PIMTable } from "@/components/products/pim-table";
import { AddProductModal } from "@/components/products/add-product-modal";
import { PageHeader } from "@/components/ui/page-header";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { getProductUrl } from "@/lib/product-utils";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";

interface ProductsClientProps {
  tenantSlug: string;
  selectedBrandSlug?: string | null;
  isPartnerAllView?: boolean;
}

type ProductClickRow = {
  id?: string | null;
  sku?: string | null;
  type?: string | null;
  title?: string | null;
  product_name?: string | null;
  parent_id?: string | null;
  parentId?: string | null;
  parent_sku?: string | null;
  parentSku?: string | null;
  parent_product_name?: string | null;
  parentProductName?: string | null;
  parent_product?: {
    id?: string | null;
    product_name?: string | null;
  } | null;
  organizationSlug?: string | null;
  organization_slug?: string | null;
};


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

  const handleProductClick = (product: ProductClickRow, options?: { section?: string }) => {
    const appendSectionParam = (url: string) => {
      if (!options?.section) return url;
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}section=${encodeURIComponent(options.section)}`;
    };

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
      router.push(appendSectionParam(unscopedUrl));
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
    router.push(appendSectionParam(scopedUrl));
  };

  const handleAddProduct = () => {
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage product models, variants, and shared partner catalog visibility."
      />
      <PageContentContainer mode="fluid" padding="page" className="space-y-4">
        {isSharedBrandView ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Viewing shared products from <span className="font-medium text-foreground">{selectedBrandSlug}</span>.
            Creating products is disabled in shared view.
          </div>
        ) : isPartnerAllView ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Viewing your products plus brand-shared products in one workspace.
            Shared brand records are read-only.
          </div>
        ) : null}

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
      </PageContentContainer>
    </div>
  );
}
