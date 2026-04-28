"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { PageHeader } from "@/components/ui/page-header";
import { PortalScopeToolbar } from "../PortalScopeToolbar";
import { PartnerCatalogExportButton } from "./PartnerCatalogExportButton";
import {
  buildPublishedQuery,
  formatPublishedDateTime,
  type PublishedCatalogProduct,
  type PublishedCatalogResponse,
  type PublishedWorkspaceBrand,
  type PublishedWorkspaceResponse,
} from "@/lib/published-client";

interface PublishedCatalogClientProps {
  tenantSlug: string;
  scope: string;
}

const PAGE_SIZE = 50;

function normalizeScope(scope: string, tenantSlug: string) {
  const normalizedScope = scope.trim().toLowerCase();
  const normalizedTenant = tenantSlug.trim().toLowerCase();
  if (
    !normalizedScope ||
    normalizedScope === "self" ||
    normalizedScope === normalizedTenant
  ) {
    return { brandSlug: null, isAll: false };
  }
  if (normalizedScope === "all") {
    return { brandSlug: null, isAll: true };
  }
  return { brandSlug: normalizedScope, isAll: false };
}

function buildProductHref(params: {
  tenantSlug: string;
  currentScope: string;
  product: PublishedCatalogProduct;
  queryString: string;
  isAllView: boolean;
}) {
  const scope = params.isAllView ? params.product.brand : params.currentScope;
  return `/${params.tenantSlug}/view/${scope}/products/${params.product.id}${
    params.queryString ? `?${params.queryString}` : ""
  }`;
}

export function PublishedCatalogClient({
  tenantSlug,
  scope,
}: PublishedCatalogClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<PublishedWorkspaceResponse | null>(null);
  const [products, setProducts] = useState<PublishedCatalogProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { brandSlug, isAll } = useMemo(
    () => normalizeScope(scope, tenantSlug),
    [scope, tenantSlug]
  );

  const selectedProfile = (searchParams.get("profile") || "").trim();
  const selectedLocale = (searchParams.get("locale") || "").trim();
  const selectedMarket = (searchParams.get("market") || "").trim();
  const selectedDestination = (searchParams.get("destination") || "").trim();

  useEffect(() => {
    setSearch((searchParams.get("q") || "").trim());
  }, [searchParams]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const workspaceResponse = await fetch("/api/published/workspace", {
          cache: "no-store",
        });
        const workspacePayload = (await workspaceResponse.json().catch(() => null)) as
          | PublishedWorkspaceResponse
          | null;
        if (!workspaceResponse.ok || !workspacePayload) {
          throw new Error("Failed to load workspace.");
        }
        if (!active) return;
        setWorkspace(workspacePayload);

        const brands = brandSlug
          ? workspacePayload.brands.filter((brand) => brand.slug === brandSlug)
          : workspacePayload.brands;

        if (brands.length === 0) {
          setProducts([]);
          setTotalCount(0);
          return;
        }

        const queryString = buildPublishedQuery({
          profile: selectedProfile || null,
          locale: selectedLocale || null,
          market: selectedMarket || null,
          destination: selectedDestination || null,
          limit: PAGE_SIZE,
          offset: 0,
        });

        const responses = await Promise.all(
          brands.map(async (brand) => {
            const response = await fetch(
              `/api/published/brands/${brand.slug}/catalog${queryString ? `?${queryString}` : ""}`,
              { cache: "no-store" }
            );
            if (!response.ok) return null;
            return (await response.json().catch(() => null)) as PublishedCatalogResponse | null;
          })
        );

        if (!active) return;

        const combinedProducts = responses
          .filter((response): response is PublishedCatalogResponse => Boolean(response))
          .flatMap((response) => response.products)
          .sort((left, right) => {
            const leftDate = left.updated_at ? new Date(left.updated_at).getTime() : 0;
            const rightDate = right.updated_at ? new Date(right.updated_at).getTime() : 0;
            return rightDate - leftDate;
          });

        const combinedTotal = responses.reduce((sum, response) => {
          if (!response) return sum;
          return sum + (response.pagination.total_count ?? response.products.length);
        }, 0);

        setProducts(combinedProducts);
        setTotalCount(combinedTotal);
      } catch (caughtError) {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load catalog.");
        setProducts([]);
        setTotalCount(0);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [brandSlug, selectedDestination, selectedLocale, selectedMarket, selectedProfile]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      [product.product_name, product.sku, product.scin, product.brand]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [products, search]);

  const selectedBrand = useMemo(() => {
    if (!brandSlug || !workspace) return null;
    return workspace.brands.find((brand) => brand.slug === brandSlug) ?? null;
  }, [brandSlug, workspace]);

  const profileOptions = useMemo(() => {
    const sourceBrands = selectedBrand ? [selectedBrand] : workspace?.brands ?? [];
    const map = new Map<string, { code: string; name: string }>();
    for (const brand of sourceBrands) {
      for (const profile of brand.profiles) {
        if (!map.has(profile.code)) {
          map.set(profile.code, { code: profile.code, name: profile.name });
        }
      }
    }
    return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [selectedBrand, workspace]);

  const queryString = useMemo(() => {
    const query = new URLSearchParams(searchParams.toString());
    return query.toString();
  }, [searchParams]);

  function updateQueryParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.push(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Products" />
      <PageContentContainer mode="fluid" padding="page" className="space-y-4">
        <PortalScopeToolbar
          title="Portal Context"
          description="Choose a market and locale to resolve the correct published Portal version for this catalog."
          rightSlot={
            !isAll && brandSlug ? (
              <PartnerCatalogExportButton
                brandSlug={brandSlug}
                marketId={selectedMarket || null}
                localeId={selectedLocale || null}
                profile={selectedProfile || "portal"}
                canExport
                variant="outline"
                size="sm"
              />
            ) : null
          }
        />

        <div className="rounded-lg border border-border bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {isAll
                  ? "Viewing published products across all shared brands."
                  : `Viewing published products for ${selectedBrand?.name || brandSlug || scope}.`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {totalCount} published product{totalCount === 1 ? "" : "s"}
                {selectedLocale ? ` | locale ${selectedLocale}` : ""}
                {selectedMarket ? ` | market ${selectedMarket}` : ""}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products"
                  className="pl-9"
                />
              </div>

              {profileOptions.length > 1 ? (
                <Select
                  value={selectedProfile || "__all__"}
                  onValueChange={(value) =>
                    updateQueryParam("profile", value === "__all__" ? "" : value)
                  }
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="All profiles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All profiles</SelectItem>
                    {profileOptions.map((profile) => (
                      <SelectItem key={profile.code} value={profile.code}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`catalog-loading-${index}`}
                className="rounded-lg border border-border bg-white p-4"
              >
                <div className="animate-pulse space-y-3">
                  <div className="h-40 rounded bg-muted" />
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-1/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-8 text-center">
            <p className="text-sm text-muted-foreground">No published products found.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <Link
                key={`${product.brand}-${product.id}`}
                href={buildProductHref({
                  tenantSlug,
                  currentScope: scope,
                  product,
                  queryString,
                  isAllView: isAll,
                })}
                className="overflow-hidden rounded-lg border border-border bg-white transition-colors hover:bg-muted/20"
              >
                <div className="relative aspect-[4/3] bg-muted/20">
                  {product.primary_image_url ? (
                    <NextImage
                      src={product.primary_image_url}
                      alt={product.product_name || product.sku || "Product"}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {product.brand}
                    </p>
                    <h3 className="line-clamp-2 text-base font-semibold text-foreground">
                      {product.product_name || product.sku || product.scin || "Untitled product"}
                    </h3>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {product.sku ? <p>SKU: {product.sku}</p> : null}
                    {product.profile ? <p>Profile: {product.profile}</p> : null}
                    <p>Published: {formatPublishedDateTime(product.published_at)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageContentContainer>
    </div>
  );
}
