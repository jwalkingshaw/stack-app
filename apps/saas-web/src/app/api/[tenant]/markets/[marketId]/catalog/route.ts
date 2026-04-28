import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  invalidatePartnerGrantCachesForBrand,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";
import { invalidateCatalogVisibilityCaches } from "@/lib/catalog-cache";
import {
  replaceMarketCatalogAssignments,
  resolveMarketCatalogAssignments,
} from "@/lib/market-catalog";

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    deduped.add(trimmed);
  }
  return Array.from(deduped);
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

async function ensureMarketExists(params: {
  organizationId: string;
  marketId: string;
}): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("markets")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.marketId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load market for catalog assignments:", error);
    return false;
  }
  return Boolean(data?.id);
}

// GET /api/[tenant]/markets/[marketId]/catalog
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; marketId: string }> }
) {
  try {
    const { tenant, marketId: marketIdParam } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
    const marketId = normalizeToken(marketIdParam);

    if (!marketId) {
      return NextResponse.json({ error: "marketId is required." }, { status: 400 });
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const organizationId = contextResult.context.targetOrganization.id;
    const exists = await ensureMarketExists({ organizationId, marketId });
    if (!exists) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    const catalog = await resolveMarketCatalogAssignments({
      organizationId,
      marketId,
    });

    if (!catalog.foundationAvailable) {
      return NextResponse.json(
        { error: "Market catalog foundation is unavailable. Apply database migrations first." },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        marketId,
        productSetIds: catalog.productSetIds,
        assetSetIds: catalog.assetSetIds,
        productSets: catalog.productSets,
        assetSets: catalog.assetSets,
      },
    });
  } catch (error) {
    console.error("Error in market catalog GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/[tenant]/markets/[marketId]/catalog
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; marketId: string }> }
) {
  try {
    const { tenant, marketId: marketIdParam } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenant, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const marketId = normalizeToken(marketIdParam);
    if (!marketId) {
      return NextResponse.json({ error: "marketId is required." }, { status: 400 });
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const organizationId = contextResult.context.targetOrganization.id;
    const exists = await ensureMarketExists({ organizationId, marketId });
    if (!exists) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const productSetIds = normalizeUuidArray(body?.productSetIds ?? body?.product_set_ids);
    const assetSetIds = normalizeUuidArray(body?.assetSetIds ?? body?.asset_set_ids);

    const replaced = await replaceMarketCatalogAssignments({
      organizationId,
      marketId,
      userId: contextResult.context.userId,
      productSetIds,
      assetSetIds,
    });

    if (!replaced.ok) {
      return NextResponse.json({ error: replaced.error }, { status: replaced.status });
    }

    await invalidateCatalogVisibilityCaches({
      organizationId,
      includeProducts: true,
      includeAssets: true,
    });
    invalidatePartnerGrantCachesForBrand(organizationId);

    return NextResponse.json({
      success: true,
      data: {
        marketId,
        productSetIds: replaced.data.productSetIds,
        assetSetIds: replaced.data.assetSetIds,
        productSets: replaced.data.productSets,
        assetSets: replaced.data.assetSets,
      },
    });
  } catch (error) {
    console.error("Error in market catalog PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

