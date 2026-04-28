"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { PageHeader } from "@/components/ui/page-header";
import { PortalScopeToolbar } from "../PortalScopeToolbar";
import {
  buildPublishedQuery,
  formatPublishedDateTime,
  type PublishedProductResponse,
} from "@/lib/published-client";

interface PublishedProductDetailClientProps {
  tenantSlug: string;
  scope: string;
  productKey: string;
  parentProductKey?: string | null;
}

function normalizeScope(scope: string, tenantSlug: string) {
  const normalizedScope = scope.trim().toLowerCase();
  const normalizedTenant = tenantSlug.trim().toLowerCase();
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

function renderValue(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.join(", ");
  }
  return JSON.stringify(value);
}

export function PublishedProductDetailClient({
  tenantSlug,
  scope,
  productKey,
  parentProductKey = null,
}: PublishedProductDetailClientProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublishedProductResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const brandSlug = useMemo(() => normalizeScope(scope, tenantSlug), [scope, tenantSlug]);
  const selectedProfile = (searchParams.get("profile") || "").trim();
  const selectedLocale = (searchParams.get("locale") || "").trim();
  const selectedMarket = (searchParams.get("market") || "").trim();
  const selectedDestination = (searchParams.get("destination") || "").trim();

  useEffect(() => {
    let active = true;

    async function load() {
      if (!brandSlug) {
        setLoading(false);
        setError("A published brand scope is required.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const query = buildPublishedQuery({
          profile: selectedProfile || null,
          locale: selectedLocale || null,
          market: selectedMarket || null,
          destination: selectedDestination || null,
        });
        const response = await fetch(
          `/api/published/brands/${brandSlug}/products/${productKey}${query ? `?${query}` : ""}`,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => null)) as PublishedProductResponse | null;
        if (!response.ok || !payload) {
          throw new Error("Failed to load published product.");
        }
        if (!active) return;
        setData(payload);
      } catch (caughtError) {
        if (!active) return;
        setData(null);
        setError(
          caughtError instanceof Error ? caughtError.message : "Failed to load published product."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [brandSlug, productKey, selectedDestination, selectedLocale, selectedMarket, selectedProfile]);

  const fieldEntries = useMemo(() => {
    if (!data) return { base: [], output: [], attributes: [] } as const;
    return {
      base: Object.entries(data.product.base_fields || {}),
      output: Object.entries(data.product.output_fields || {}),
      attributes: Object.entries(data.product.attributes || {}),
    } as const;
  }, [data]);

  return (
    <PageContentContainer mode="form" padding="page" className="space-y-4">
      <PageHeader
        title={data?.product.product_name || "Product"}
        sticky={false}
        backHref={`/${tenantSlug}/view/${scope}/products${
          searchParams.toString() ? `?${searchParams.toString()}` : ""
        }`}
        backLabel="Back to Products"
      />

      {parentProductKey ? (
        <div className="rounded-lg border border-border bg-white p-3 text-sm">
          <Link
            href={`/${tenantSlug}/view/${scope}/products/${parentProductKey}${
              searchParams.toString() ? `?${searchParams.toString()}` : ""
            }`}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Return to parent product
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-white p-5">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-64 rounded bg-muted" />
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-48 rounded bg-muted" />
            </div>
          </div>
        </div>
      ) : !data ? null : (
        <div className="space-y-4">
          <PortalScopeToolbar
            title="Portal Context"
            description="Choose a market and locale to resolve the correct published Portal version for this product."
          />

          <div className="grid gap-4 xl:grid-cols-[1.4fr,0.9fr]">
            <div className="rounded-lg border border-border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {data.brand.name}
                  </p>
                  <h1 className="text-2xl font-semibold text-foreground">
                    {data.product.product_name || data.product.sku || data.product.scin || "Untitled"}
                  </h1>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.product.sku ? <Badge variant="secondary">SKU {data.product.sku}</Badge> : null}
                    {data.product.scin ? <Badge variant="secondary">SCIN {data.product.scin}</Badge> : null}
                    {data.product.profile ? (
                      <Badge variant="secondary">{data.product.profile}</Badge>
                    ) : null}
                    {data.product.status ? <Badge variant="outline">{data.product.status}</Badge> : null}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Published</p>
                  <p className="font-medium text-foreground">
                    {formatPublishedDateTime(data.product.published_at)}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {fieldEntries.attributes.slice(0, 8).map(([key, value]) => (
                  <div key={key} className="rounded-md border border-border/60 bg-muted/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                    <p className="mt-1 text-sm text-foreground">{renderValue(value)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-foreground">Asset Slots</h2>
              {data.product.asset_slots.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No published asset slots.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {data.product.asset_slots.map((asset) => {
                    const preview =
                      (asset.delivery.thumbnail_urls?.medium as string | undefined) ||
                      (asset.delivery.thumbnail_urls?.small as string | undefined) ||
                      asset.delivery.original_url;
                    return (
                      <div
                        key={asset.id}
                        className="overflow-hidden rounded-lg border border-border/60"
                      >
                        <div className="relative aspect-[4/3] bg-muted/20">
                          {preview ? (
                            <NextImage
                              src={preview}
                              alt={asset.alt_text || asset.original_filename || asset.filename || "Asset"}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                              No preview
                            </div>
                          )}
                        </div>
                        <div className="space-y-1 p-3 text-sm">
                          <p className="font-medium text-foreground">
                            {asset.original_filename || asset.filename || "Asset"}
                          </p>
                          <p className="text-muted-foreground">
                            {asset.file_type || asset.mime_type || "File"}
                          </p>
                          {asset.delivery.original_url ? (
                            <Link
                              href={asset.delivery.original_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
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
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-lg border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-foreground">Base Fields</h2>
              <div className="mt-3 space-y-2">
                {fieldEntries.base.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No base fields in this publish.</p>
                ) : (
                  fieldEntries.base.map(([key, value]) => (
                    <div key={key} className="rounded-md border border-border/60 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                      <p className="mt-1 text-sm text-foreground">{renderValue(value)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-foreground">Output Overrides</h2>
              <div className="mt-3 space-y-2">
                {fieldEntries.output.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No output-specific overrides.</p>
                ) : (
                  fieldEntries.output.map(([key, value]) => (
                    <div key={key} className="rounded-md border border-border/60 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                      <p className="mt-1 text-sm text-foreground">{renderValue(value)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-foreground">Publish Details</h2>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Profile</p>
                  <p className="text-foreground">{data.product.profile || "Default"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Locale</p>
                  <p className="text-foreground">{data.product.locale || "Default"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Market</p>
                  <p className="text-foreground">{data.product.market || "Default"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Publish version</p>
                  <p className="break-all text-foreground">{data.product.publish_version}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContentContainer>
  );
}
