"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { PageHeader } from "@/components/ui/page-header";
import type {
  PublishedAssetsResponse,
  PublishedCatalogResponse,
  PublishedUpdatesResponse,
  PublishedWorkspaceBrand,
  PublishedWorkspaceResponse,
} from "@/lib/published-client";

interface PartnerHomeClientProps {
  tenantSlug: string;
  scope: string;
}

function normalizeScope(scope: string, tenantSlug: string) {
  const normalizedScope = (scope || "").trim().toLowerCase();
  const normalizedTenant = (tenantSlug || "").trim().toLowerCase();
  if (!normalizedScope || normalizedScope === "all" || normalizedScope === "self") {
    return { brandSlug: null, isAll: true };
  }
  if (normalizedScope === normalizedTenant) {
    return { brandSlug: null, isAll: false };
  }
  return { brandSlug: normalizedScope, isAll: false };
}

type BrandSummary = {
  brand: PublishedWorkspaceBrand;
  productCount: number;
  assetCount: number;
  publishCount: number;
};

export function PartnerHomeClient({ tenantSlug, scope }: PartnerHomeClientProps) {
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<PublishedWorkspaceResponse | null>(null);
  const [brandSummaries, setBrandSummaries] = useState<BrandSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { brandSlug, isAll } = useMemo(() => normalizeScope(scope, tenantSlug), [scope, tenantSlug]);

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

        const results = await Promise.all(
          brands.map(async (brand) => {
            const [catalogResponse, assetsResponse, updatesResponse] = await Promise.all([
              fetch(`/api/published/brands/${brand.slug}/catalog?limit=1`, { cache: "no-store" }),
              fetch(`/api/published/brands/${brand.slug}/assets?limit=1`, { cache: "no-store" }),
              fetch(`/api/published/brands/${brand.slug}/updates`, { cache: "no-store" }),
            ]);

            const catalogPayload = (await catalogResponse.json().catch(() => null)) as
              | PublishedCatalogResponse
              | null;
            const assetsPayload = (await assetsResponse.json().catch(() => null)) as
              | PublishedAssetsResponse
              | null;
            const updatesPayload = (await updatesResponse.json().catch(() => null)) as
              | PublishedUpdatesResponse
              | null;

            return {
              brand,
              productCount: catalogPayload?.pagination.total_count ?? catalogPayload?.products.length ?? 0,
              assetCount: assetsPayload?.pagination.total_count ?? assetsPayload?.assets.length ?? 0,
              publishCount: updatesPayload?.updates.length ?? 0,
            } satisfies BrandSummary;
          })
        );

        if (!active) return;
        setBrandSummaries(results);
      } catch (caughtError) {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load workspace.");
        setBrandSummaries([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [brandSlug]);

  const totalProducts = brandSummaries.reduce((sum, item) => sum + item.productCount, 0);
  const totalAssets = brandSummaries.reduce((sum, item) => sum + item.assetCount, 0);
  const totalPublishes = brandSummaries.reduce((sum, item) => sum + item.publishCount, 0);
  const totalProfiles = brandSummaries.reduce((sum, item) => sum + item.brand.profiles.length, 0);

  return (
    <PageContentContainer mode="form" padding="page" className="space-y-4">
      <PageHeader title="Home" sticky={false} />

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`home-loading-${index}`}
              className="rounded-lg border border-border bg-white p-4"
            >
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-7 w-16 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-xs text-muted-foreground">Brands</p>
              <p className="text-2xl font-semibold text-foreground">{brandSummaries.length}</p>
              <p className="text-xs text-muted-foreground">visible in this workspace</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-xs text-muted-foreground">Published Products</p>
              <p className="text-2xl font-semibold text-foreground">{totalProducts}</p>
              <p className="text-xs text-muted-foreground">resolved product documents</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-xs text-muted-foreground">Published Assets</p>
              <p className="text-2xl font-semibold text-foreground">{totalAssets}</p>
              <p className="text-xs text-muted-foreground">delivery-ready asset documents</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-xs text-muted-foreground">Profiles / Publishes</p>
              <p className="text-2xl font-semibold text-foreground">{totalProfiles}</p>
              <p className="text-xs text-muted-foreground">{totalPublishes} recent publishes</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {isAll ? "Shared Brands" : "Published Scope"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isAll
                    ? "Each brand view reads from the published API contract."
                    : `Viewing ${brandSlug || workspace?.workspace.name || "workspace"} through published documents.`}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {brandSummaries.map((summary) => (
                <div
                  key={summary.brand.id}
                  className="rounded-lg border border-border/60 p-4 transition-colors hover:bg-muted/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {summary.brand.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{summary.brand.slug}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Latest publish</p>
                      <p className="font-medium text-foreground">
                        {summary.brand.latest_publish_at
                          ? new Date(summary.brand.latest_publish_at).toLocaleDateString()
                          : "Not published"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Products</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{summary.productCount}</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Assets</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{summary.assetCount}</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Publishes</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{summary.publishCount}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/${tenantSlug}/view/${summary.brand.slug}/products`}
                      className="inline-flex items-center rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      Open catalog
                    </Link>
                    <Link
                      href={`/${tenantSlug}/view/${summary.brand.slug}/assets`}
                      className="inline-flex items-center rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      Open assets
                    </Link>
                    <Link
                      href={`/${tenantSlug}/view/${summary.brand.slug}/updates`}
                      className="inline-flex items-center rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      Open updates
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageContentContainer>
  );
}

