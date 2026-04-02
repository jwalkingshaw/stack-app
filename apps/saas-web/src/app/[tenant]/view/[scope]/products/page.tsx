import { ProductsClient } from "../../../products/ProductsClient";
import { PartnerCatalogContextBar } from "./PartnerCatalogContextBar";

interface ScopedProductsPageProps {
  params: Promise<{ tenant: string; scope: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

export default async function ScopedProductsPage({ params, searchParams }: ScopedProductsPageProps) {
  const resolvedParams = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const tenantSlug = resolvedParams.tenant;
  const normalizedScope = resolvedParams.scope.trim().toLowerCase();
  const isPartnerAllView = normalizedScope === "all";
  const selectedBrandSlug = normalizeSelectedBrand(resolvedParams.scope, tenantSlug);

  // Extract market + locale from query params for context bar scoping
  const marketId = typeof resolvedSearch.market === "string" ? resolvedSearch.market : null;
  const localeId = typeof resolvedSearch.locale === "string" ? resolvedSearch.locale : null;

  return (
    <>
      {/* Channel context bar — partner-scoped views only */}
      {selectedBrandSlug ? (
        <PartnerCatalogContextBar
          tenantSlug={tenantSlug}
          scope={selectedBrandSlug}
          marketId={marketId}
          localeId={localeId}
        />
      ) : null}

      <ProductsClient
        tenantSlug={tenantSlug}
        selectedBrandSlug={selectedBrandSlug}
        isPartnerAllView={isPartnerAllView}
      />
    </>
  );
}
