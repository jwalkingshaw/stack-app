import { NextRequest, NextResponse } from "next/server";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { supabaseServer } from "@/lib/supabase";

type SearchProductResult = {
  id: string;
  title: string;
  subtitle: string | null;
  sku: string | null;
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
  updatedAt: string | null;
  organizationId: string | null;
  organizationSlug: string | null;
  organizationName: string | null;
};

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

function sortByUpdatedDesc<T extends { updatedAt?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aTime = new Date(String(a.updatedAt || 0)).getTime();
    const bTime = new Date(String(b.updatedAt || 0)).getTime();
    return bTime - aTime;
  });
}

async function resolveOrganizationLookup(organizationIds: string[]): Promise<OrganizationLookup> {
  if (organizationIds.length === 0) return {};

  const { data, error } = await supabaseServer
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

    const mappedProducts: SearchProductResult[] = productRows
      .map((row) => {
        const id = asString(row.id);
        if (!id) return null;

        const title = asString(row.product_name) || asString(row.sku) || id;
        const sku = asString(row.sku);
        const status = asString(row.status);
        const productType = asString(row.type);
        const organizationId = asString(row.organization_id);
        const organizationSlug = asString(row.organization_slug);
        const organizationName = asString(row.organization_name);

        return {
          id,
          title,
          subtitle: buildSubtitle([sku, status]),
          sku,
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

        return {
          id,
          title,
          subtitle: buildSubtitle([fileType, assetScope]),
          fileType,
          assetScope,
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
      let updatesQuery = supabaseServer
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
          const { data: kitRows, error: kitError } = await supabaseServer
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

    const products = sortByUpdatedDesc(withOrganization(mappedProducts)).slice(0, perTypeLimit);
    const assets = sortByUpdatedDesc(withOrganization(mappedAssets)).slice(0, perTypeLimit);
    const updates = sortByUpdatedDesc(withOrganization(mappedUpdates)).slice(0, perTypeLimit);
    const kits = sortByUpdatedDesc(withOrganization(mappedKits)).slice(0, perTypeLimit);

    return NextResponse.json({
      data: {
        query,
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
