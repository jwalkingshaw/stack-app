"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { PageHeader } from "@/components/ui/page-header";
import { PortalScopeToolbar } from "../PortalScopeToolbar";
import {
  buildPublishedQuery,
  formatPublishedDateTime,
  type PublishedAsset,
  type PublishedAssetsResponse,
  type PublishedWorkspaceResponse,
} from "@/lib/published-client";

interface PublishedAssetsClientProps {
  tenantSlug: string;
  scope: string;
}

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

const PAGE_SIZE = 50;

export function PublishedAssetsClient({ tenantSlug, scope }: PublishedAssetsClientProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<PublishedWorkspaceResponse | null>(null);
  const [assets, setAssets] = useState<PublishedAsset[]>([]);
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
              `/api/published/brands/${brand.slug}/assets${queryString ? `?${queryString}` : ""}`,
              { cache: "no-store" }
            );
            if (!response.ok) return null;
            return (await response.json().catch(() => null)) as PublishedAssetsResponse | null;
          })
        );
        if (!active) return;

        const combinedAssets = responses
          .filter((response): response is PublishedAssetsResponse => Boolean(response))
          .flatMap((response) => response.assets)
          .sort((left, right) => {
            const leftDate = left.updated_at ? new Date(left.updated_at).getTime() : 0;
            const rightDate = right.updated_at ? new Date(right.updated_at).getTime() : 0;
            return rightDate - leftDate;
          });

        const combinedTotal = responses.reduce((sum, response) => {
          if (!response) return sum;
          return sum + (response.pagination.total_count ?? response.assets.length);
        }, 0);

        setAssets(combinedAssets);
        setTotalCount(combinedTotal);
      } catch (caughtError) {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load assets.");
        setAssets([]);
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

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return assets;
    return assets.filter((asset) =>
      [asset.original_filename, asset.filename, asset.brand, ...asset.tags]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [assets, search]);

  const selectedBrand = useMemo(() => {
    if (!brandSlug || !workspace) return null;
    return workspace.brands.find((brand) => brand.slug === brandSlug) ?? null;
  }, [brandSlug, workspace]);

  return (
    <div className="space-y-6">
      <PageHeader title="Assets" />
      <PageContentContainer mode="fluid" padding="page" className="space-y-4">
        <PortalScopeToolbar
          title="Portal Context"
          description="Choose a market and locale to resolve the correct published Portal version for product-linked and Brand Library assets."
        />

        <div className="rounded-lg border border-border bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {isAll
                  ? "Viewing published assets across all shared brands."
                  : `Viewing published assets for ${selectedBrand?.name || brandSlug || scope}.`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {totalCount} published asset{totalCount === 1 ? "" : "s"}
              </p>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search assets"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`assets-loading-${index}`}
                className="rounded-lg border border-border bg-white p-4"
              >
                <div className="animate-pulse space-y-3">
                  <div className="aspect-square rounded bg-muted" />
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-8 text-center">
            <p className="text-sm text-muted-foreground">No published assets found.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredAssets.map((asset) => {
              const preview =
                (asset.delivery.thumbnail_urls?.medium as string | undefined) ||
                (asset.delivery.thumbnail_urls?.small as string | undefined) ||
                asset.delivery.original_url;

              return (
                <div
                  key={`${asset.brand}-${asset.id}`}
                  className="overflow-hidden rounded-lg border border-border bg-white"
                >
                  <div className="relative aspect-square bg-muted/20">
                    {preview ? (
                      <NextImage
                        src={preview}
                        alt={asset.alt_text || asset.original_filename || asset.filename || "Asset"}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <FileText className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {asset.brand}
                      </p>
                      <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                        {asset.original_filename || asset.filename || "Asset"}
                      </h3>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>{asset.file_type || asset.mime_type || "File"}</p>
                      <p>Updated {formatPublishedDateTime(asset.updated_at)}</p>
                    </div>
                    {asset.delivery.original_url ? (
                      <Link
                        href={asset.delivery.original_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Open asset
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageContentContainer>
    </div>
  );
}
