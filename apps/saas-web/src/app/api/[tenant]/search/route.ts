import { NextRequest, NextResponse } from "next/server";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { getSupabaseServer } from "@/lib/supabase";
import {
  resolveStorageDeliveryUrl,
  rewriteStorageUrlToCloudFront,
  rewriteThumbnailUrls,
} from "@/lib/storage-url";

type SearchProductResult = {
  id: string;
  title: string;
  subtitle: string | null;
  sku: string | null;
  scin: string | null;
  thumbnailUrl: string | null;
  productType: string | null;
  parentId: string | null;
  status: string | null;
  updatedAt: string | null;
  organizationId: string | null;
  organizationSlug: string | null;
  organizationName: string | null;
};

type SearchAssetResult = {
  id: string;
  title: string;
  subtitle: string | null;
  fileType: string | null;
  assetScope: string | null;
  s3Key: string | null;
  mimeType: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  originalFilename: string | null;
  tags: string[];
  productIdentifiers: string[];
  updatedAt: string | null;
  organizationId: string | null;
  organizationSlug: string | null;
  organizationName: string | null;
};

type SearchResultKind = "product" | "asset";

type SearchResultItem =
  | (SearchProductResult & { kind: "product"; score: number })
  | (SearchAssetResult & { kind: "asset"; score: number });

type SearchUpdateResult = {
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  urgency: string | null;
  updatedAt: string | null;
  organizationId: string | null;
  organizationSlug: string | null;
  organizationName: string | null;
};

type SearchKitResult = SearchUpdateResult & {
  kitItemCount: number;
};

type OrganizationLookup = Record<string, { slug: string; name: string }>;
type ThumbnailLookup = Record<string, string | null>;
type ThumbnailPayload = Record<string, unknown> | null | undefined;

function normalizeSearchQuery(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 6;
  return Math.min(12, parsed);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildSubtitle(parts: Array<string | null | undefined>): string | null {
  const normalized = parts
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  if (normalized.length === 0) return null;
  return normalized.join(" | ");
}

function extractPreviewUrl(
  thumbnailPayload: ThumbnailPayload,
  fallbackUrl: string | null | undefined
): string | null {
  const thumbnails = rewriteThumbnailUrls(
    thumbnailPayload && typeof thumbnailPayload === "object" && !Array.isArray(thumbnailPayload)
      ? thumbnailPayload
      : null
  );

  const thumbnailCandidates = [
    thumbnails?.medium,
    thumbnails?.small,
    thumbnails?.large,
    fallbackUrl,
  ];

  for (const candidate of thumbnailCandidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

function sortByUpdatedDesc<T extends { updatedAt?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aTime = new Date(String(a.updatedAt || 0)).getTime();
    const bTime = new Date(String(b.updatedAt || 0)).getTime();
    return bTime - aTime;
  });
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function normalizeText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeCompact(value: string | null | undefined): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function scoreTextMatch(value: string | null | undefined, query: string): number {
  const normalized = normalizeText(value);
  if (!normalized) return 0;

  let score = 0;
  if (normalized === query) {
    score = Math.max(score, 120);
  } else if (normalized.startsWith(query)) {
    score = Math.max(score, 80);
  } else {
    const containsIndex = normalized.indexOf(query);
    if (containsIndex >= 0) {
      score = Math.max(score, Math.max(20, 60 - containsIndex));
    }
  }

  const compactValue = normalizeCompact(value);
  const compactQuery = normalizeCompact(query);
  if (!compactValue || !compactQuery) {
    return score;
  }
  if (compactValue === compactQuery) {
    score = Math.max(score, 118);
  } else if (compactValue.startsWith(compactQuery)) {
    score = Math.max(score, 78);
  } else {
    const compactIndex = compactValue.indexOf(compactQuery);
    if (compactIndex >= 0) {
      score = Math.max(score, Math.max(18, 58 - compactIndex));
    }
  }

  return score;
}

function scoreProductResult(product: SearchProductResult, query: string): number {
  let score = 0;
  score = Math.max(score, scoreTextMatch(product.title, query) + 30);
  score = Math.max(score, scoreTextMatch(product.sku, query) + 20);
  score = Math.max(score, scoreTextMatch(product.scin, query) + 18);

  const subtitleParts = (product.subtitle || "").split("|").map((part) => part.trim());
  for (const part of subtitleParts) {
    score = Math.max(score, scoreTextMatch(part, query) + 4);
  }

  return score;
}

function scoreAssetResult(asset: SearchAssetResult, query: string): number {
  let score = 0;
  score = Math.max(score, scoreTextMatch(asset.title, query) + 30);
  score = Math.max(score, scoreTextMatch(asset.originalFilename, query) + 24);
  score = Math.max(score, scoreTextMatch(asset.s3Key, query) + 6);
  score = Math.max(score, scoreTextMatch(asset.description, query) + 10);
  score = Math.max(score, scoreTextMatch(asset.fileType, query) + 5);
  score = Math.max(score, scoreTextMatch(asset.id, query));

  for (const tag of asset.tags) {
    score = Math.max(score, scoreTextMatch(tag, query) + 8);
  }
  for (const productIdentifier of asset.productIdentifiers) {
    score = Math.max(score, scoreTextMatch(productIdentifier, query) + 12);
  }

  return score;
}

function sortMixedResults(rows: SearchResultItem[]): SearchResultItem[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = new Date(String(a.updatedAt || 0)).getTime();
    const bTime = new Date(String(b.updatedAt || 0)).getTime();
    return bTime - aTime;
  });
}

async function resolveProductThumbnailLookup(
  rows: Array<{ id: string; organizationId: string | null }>
): Promise<ThumbnailLookup> {
  const productIds = Array.from(new Set(rows.map((row) => row.id).filter(Boolean)));
  const organizationIds = Array.from(
    new Set(rows.map((row) => row.organizationId).filter((id): id is string => Boolean(id)))
  );
  if (productIds.length === 0 || organizationIds.length === 0) {
    return {};
  }

  const thumbnailLookup: ThumbnailLookup = {};

  const { data: assetLinkRows } = await getSupabaseServer()
    .from("product_asset_links")
    .select(
      `
        product_id,
        is_primary,
        created_at,
        product_fields!product_asset_links_product_field_id_fkey(code),
        dam_assets!inner(thumbnail_urls, s3_url, s3_key)
      `
    )
    .in("organization_id", organizationIds)
    .in("product_id", productIds)
    .eq("is_active", true);

  if (Array.isArray(assetLinkRows)) {
    const rankedByProduct = new Map<string, { score: number; createdAt: number; url: string | null }>();

    for (const row of assetLinkRows as Array<{
      product_id: string | null;
      is_primary?: boolean | null;
      created_at?: string | null;
      product_fields?: { code?: string | null } | Array<{ code?: string | null }> | null;
      dam_assets?: {
        thumbnail_urls?: ThumbnailPayload
        s3_url?: string | null
        s3_key?: string | null
      } | Array<{
        thumbnail_urls?: ThumbnailPayload
        s3_url?: string | null
        s3_key?: string | null
      }> | null;
    }>) {
      const productId = asString(row.product_id);
      if (!productId) continue;

      const fieldRecord = Array.isArray(row.product_fields)
        ? row.product_fields[0]
        : row.product_fields;
      const assetRecord = Array.isArray(row.dam_assets) ? row.dam_assets[0] : row.dam_assets;
      const url = extractPreviewUrl(
        assetRecord?.thumbnail_urls,
        resolveStorageDeliveryUrl({
          s3Key: asString(assetRecord?.s3_key),
          s3Url: asString(assetRecord?.s3_url),
        })
      );
      if (!url) continue;

      const fieldCode = asString(fieldRecord?.code);
      let score = row.is_primary ? 70 : 0;
      if (fieldCode === "image_front") score += 120;
      else if (fieldCode === "image_hero") score += 100;
      else if (fieldCode === "image_label") score += 90;
      else if (fieldCode === "image_left" || fieldCode === "image_right") score += 50;
      else if (fieldCode === "image_back") score += 35;
      else score += 10;

      const createdAt = new Date(String(row.created_at || 0)).getTime();
      const current = rankedByProduct.get(productId);
      if (!current || score > current.score || (score === current.score && createdAt > current.createdAt)) {
        rankedByProduct.set(productId, { score, createdAt, url });
      }
    }

    for (const [productId, entry] of rankedByProduct.entries()) {
      thumbnailLookup[productId] = entry.url;
    }
  }

  const missingIds = productIds.filter((productId) => !thumbnailLookup[productId]);
  if (missingIds.length === 0) {
    return thumbnailLookup;
  }

  const { data: productRows } = await getSupabaseServer()
    .from("products")
    .select("id, primary_image_url")
    .in("organization_id", organizationIds)
    .in("id", missingIds);

  if (Array.isArray(productRows)) {
    for (const row of productRows as Array<{ id: string | null; primary_image_url?: string | null }>) {
      const productId = asString(row.id);
      const url = rewriteStorageUrlToCloudFront(asString(row.primary_image_url));
      if (!productId || !url) continue;
      thumbnailLookup[productId] = url;
    }
  }

  return thumbnailLookup;
}

async function resolveOrganizationLookup(organizationIds: string[]): Promise<OrganizationLookup> {
  if (organizationIds.length === 0) return {};

  const { data, error } = await getSupabaseServer()
    .from("organizations")
    .select("id,slug,name")
    .in("id", organizationIds);

  if (error || !Array.isArray(data)) return {};

  const lookup: OrganizationLookup = {};
  for (const row of data as Array<{ id: string; slug: string; name: string }>) {
    if (!row.id) continue;
    lookup[row.id] = {
      slug: row.slug,
      name: row.name,
    };
  }
  return lookup;
}

async function fetchScopedApi<T>(params: {
  request: NextRequest;
  path: string;
}): Promise<T | null> {
  const origin = new URL(params.request.url).origin;
  const cookieHeader = params.request.headers.get("cookie") || "";

  try {
    const response = await fetch(`${origin}${params.path}`, {
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const requestUrl = new URL(request.url);
    const query = normalizeSearchQuery(
      requestUrl.searchParams.get("q") ?? requestUrl.searchParams.get("search")
    );
    const perTypeLimit = parseLimit(requestUrl.searchParams.get("limit"));

    if (!query || query.length < 2) {
      return NextResponse.json({
        data: {
          query: query || "",
          results: [],
          products: [],
          assets: [],
          updates: [],
          kits: [],
        },
      });
    }

    const selectedBrandSlug = requestUrl.searchParams.get("brand");
    const requestedView = (requestUrl.searchParams.get("view") || "").trim().toLowerCase();

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const { context } = contextResult;
    const isPartnerAllViewRequest =
      requestedView === "all" &&
      context.mode === "tenant" &&
      context.tenantOrganization.organizationType === "partner";

    const productAssetQuery = new URLSearchParams();
    productAssetQuery.set("q", query);
    productAssetQuery.set("limit", String(Math.max(24, perTypeLimit * 4)));
    if (isPartnerAllViewRequest) {
      productAssetQuery.set("view", "all");
    } else if (context.mode === "partner_brand" && context.selectedBrandSlug) {
      productAssetQuery.set("brand", context.selectedBrandSlug);
    }

    const [productsPayload, assetsPayload] = await Promise.all([
      fetchScopedApi<{ data?: Array<Record<string, unknown>> }>({
        request,
        path: `/api/${tenant}/products?${new URLSearchParams({
          ...Object.fromEntries(productAssetQuery.entries()),
          fields: "table",
        }).toString()}`,
      }),
      fetchScopedApi<{
        data?: {
          assets?: Array<Record<string, unknown>>;
        };
      }>({
        request,
        path: `/api/${tenant}/assets?${new URLSearchParams({
          ...Object.fromEntries(productAssetQuery.entries()),
          fields: "lite",
        }).toString()}`,
      }),
    ]);

    const productRows = Array.isArray(productsPayload?.data) ? productsPayload.data : [];
    const assetRows = Array.isArray(assetsPayload?.data?.assets) ? assetsPayload.data.assets : [];
    const productThumbnailLookup = await resolveProductThumbnailLookup(
      productRows
        .map((row) => ({
          id: asString(row.id) || "",
          organizationId: asString(row.organization_id),
        }))
        .filter((row) => row.id.length > 0)
    );

    const mappedProducts: SearchProductResult[] = productRows
      .map((row) => {
        const id = asString(row.id);
        if (!id) return null;

        const title = asString(row.product_name) || asString(row.sku) || id;
        const sku = asString(row.sku);
        const scin = asString(row.scin);
        const status = asString(row.status);
        const productType = asString(row.type);
        const organizationId = asString(row.organization_id);
        const organizationSlug = asString(row.organization_slug);
        const organizationName = asString(row.organization_name);

        return {
          id,
          title,
          subtitle: buildSubtitle([sku, scin, status]),
          sku,
          scin,
          thumbnailUrl: productThumbnailLookup[id] || null,
          productType,
          parentId: asString(row.parent_id),
          status,
          updatedAt: asString(row.updated_at),
          organizationId,
          organizationSlug,
          organizationName,
        };
      })
      .filter((row): row is SearchProductResult => Boolean(row));

    const mappedAssets: SearchAssetResult[] = assetRows
      .map((row) => {
        const id = asString(row.id);
        if (!id) return null;

        const title = asString(row.filename) || id;
        const fileType = asString(row.fileType);
        const assetScope = asString(row.assetScope);
        const s3Key = asString(row.s3Key) || asString(row.s3_key);
        const mimeType = asString(row.mimeType) || asString(row.mime_type);
        const thumbnailUrl = extractPreviewUrl(
          (row.thumbnailUrls ?? row.thumbnail_urls) as ThumbnailPayload,
          resolveStorageDeliveryUrl({
            s3Key: asString(row.s3Key) || asString(row.s3_key),
            s3Url: asString(row.s3Url) || asString(row.s3_url),
          })
        );
        const description = asString(row.description);
        const originalFilename = asString(row.originalFilename) || asString(row.original_filename);
        const tags = toStringArray(row.tags);
        const productIdentifiers = toStringArray(
          row.productIdentifiers ?? row.product_identifiers
        );

        return {
          id,
          title,
          subtitle: buildSubtitle([fileType, assetScope]),
          fileType,
          assetScope,
          s3Key,
          mimeType,
          thumbnailUrl,
          description,
          originalFilename,
          tags,
          productIdentifiers,
          updatedAt: asString(row.updatedAt),
          organizationId: asString(row.organizationId),
          organizationSlug: null as string | null,
          organizationName: null as string | null,
        };
      })
      .filter((row): row is SearchAssetResult => Boolean(row));

    let mappedUpdates: SearchUpdateResult[] = [];
    let mappedKits: SearchKitResult[] = [];

    const updatesAllowedInScope =
      context.mode === "tenant" ||
      (context.mode === "partner_brand" &&
        context.tenantOrganization.organizationType === "partner");

    if (updatesAllowedInScope) {
      let updatesQuery = getSupabaseServer()
        .from("partner_updates")
        .select("id,organization_id,title,summary,status,urgency,updated_at")
        .eq("organization_id", context.targetOrganization.id)
        .order("updated_at", { ascending: false })
        .limit(Math.max(24, perTypeLimit * 4));

      if (context.mode === "partner_brand") {
        updatesQuery = updatesQuery.in("status", ["published", "scheduled"]);
      }

      const escaped = query.replace(/[%_]/g, "\\$&");
      updatesQuery = updatesQuery.or(
        `title.ilike.%${escaped}%,summary.ilike.%${escaped}%`
      );

      const { data: updateRows, error: updateError } = await updatesQuery;
      if (!updateError && Array.isArray(updateRows)) {
        mappedUpdates = updateRows
          .map((row) => {
            const id = asString(row.id);
            if (!id) return null;
            return {
              id,
              title: asString(row.title) || id,
              subtitle: buildSubtitle([asString(row.status), asString(row.urgency)]),
              status: asString(row.status),
              urgency: asString(row.urgency),
              updatedAt: asString(row.updated_at),
              organizationId: asString(row.organization_id),
              organizationSlug: null as string | null,
              organizationName: null as string | null,
            };
          })
          .filter((row): row is SearchUpdateResult => Boolean(row));

        const updateIds = mappedUpdates.map((row) => row.id);
        if (updateIds.length > 0) {
          const { data: kitRows, error: kitError } = await getSupabaseServer()
            .from("partner_update_kit_items")
            .select("partner_update_id")
            .eq("organization_id", context.targetOrganization.id)
            .in("partner_update_id", updateIds);

          if (!kitError && Array.isArray(kitRows)) {
            const counts = new Map<string, number>();
            for (const row of kitRows as Array<{ partner_update_id: string | null }>) {
              if (!row.partner_update_id) continue;
              counts.set(row.partner_update_id, (counts.get(row.partner_update_id) || 0) + 1);
            }

            mappedKits = mappedUpdates
              .filter((update) => (counts.get(update.id) || 0) > 0)
              .map((update) => ({
                ...update,
                subtitle: buildSubtitle([update.status, `${counts.get(update.id) || 0} items`]),
                kitItemCount: counts.get(update.id) || 0,
              }));
          }
        }
      }
    }

    const organizationIds = Array.from(
      new Set(
        [
          ...mappedProducts.map((row) => row.organizationId),
          ...mappedAssets.map((row) => row.organizationId),
          ...mappedUpdates.map((row) => row.organizationId),
          ...mappedKits.map((row) => row.organizationId),
        ].filter((id): id is string => Boolean(id))
      )
    );
    const organizationLookup = await resolveOrganizationLookup(organizationIds);

    const withOrganization = <T extends {
      organizationId: string | null;
      organizationSlug: string | null;
      organizationName: string | null;
    }>(rows: T[]): T[] =>
      rows.map((row) => {
        if (!row.organizationId) return row;
        const lookup = organizationLookup[row.organizationId];
        if (!lookup) return row;
        return {
          ...row,
          organizationSlug: row.organizationSlug || lookup.slug,
          organizationName: row.organizationName || lookup.name,
        };
      });

    const scoredResults = sortMixedResults([
      ...withOrganization(mappedProducts)
        .map(
          (row) =>
            ({
              ...row,
              kind: "product" as const,
              score: scoreProductResult(row, query),
            }) satisfies SearchResultItem
        )
        .filter((row) => row.score > 0),
      ...withOrganization(mappedAssets)
        .map(
          (row) =>
            ({
              ...row,
              kind: "asset" as const,
              score: scoreAssetResult(row, query),
            }) satisfies SearchResultItem
        )
        .filter((row) => row.score > 0),
    ]);

    const resultLimit = Math.max(perTypeLimit * 2, perTypeLimit);
    const results = scoredResults.slice(0, resultLimit);
    const products = results
      .filter((row): row is Extract<SearchResultItem, { kind: "product" }> => row.kind === "product")
      .slice(0, perTypeLimit)
      .map(({ kind: _kind, score: _score, ...row }) => row);
    const assets = results
      .filter((row): row is Extract<SearchResultItem, { kind: "asset" }> => row.kind === "asset")
      .slice(0, perTypeLimit)
      .map(({ kind: _kind, score: _score, ...row }) => row);
    const updates = sortByUpdatedDesc(withOrganization(mappedUpdates)).slice(0, perTypeLimit);
    const kits = sortByUpdatedDesc(withOrganization(mappedKits)).slice(0, perTypeLimit);

    return NextResponse.json({
      data: {
        query,
        results: results.map(({ score: _score, ...row }) => row),
        products,
        assets,
        updates,
        kits,
      },
    });
  } catch (error) {
    console.error("Error in global search GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
