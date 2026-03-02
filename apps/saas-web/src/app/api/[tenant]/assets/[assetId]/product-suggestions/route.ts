import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { generateProductLinkSuggestions } from "@tradetool/ui";
import {
  resolvePartnerGrantedAssetIds,
  resolvePartnerGrantedProductIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isCrossTenantWrite(params: { tenantSlug: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenantSlug.trim().toLowerCase();
}

async function resolveSuggestionReadConstraints(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
}): Promise<{ allowedAssetIds: Set<string> | null; allowedProductIds: Set<string> | null }> {
  const grantedAssets = await resolvePartnerGrantedAssetIds({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
  });
  const grantedProducts = await resolvePartnerGrantedProductIds({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
  });

  if (grantedAssets.foundationAvailable && grantedProducts.foundationAvailable) {
    return {
      allowedAssetIds: new Set(grantedAssets.assetIds),
      allowedProductIds: new Set(grantedProducts.productIds),
    };
  }

  return {
    allowedAssetIds: null,
    allowedProductIds: null,
  };
}

// GET /api/[tenant]/assets/[assetId]/product-suggestions - Get AI product suggestions for an asset
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const { tenant, assetId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const { getUser } = getKindeServerSession();
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { context } = contextResult;
    const targetOrganizationId = context.targetOrganization.id;

    let allowedAssetIds: Set<string> | null = null;
    let allowedProductIds: Set<string> | null = null;
    if (context.mode === "partner_brand") {
      const constraints = await resolveSuggestionReadConstraints({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
      });
      allowedAssetIds = constraints.allowedAssetIds;
      allowedProductIds = constraints.allowedProductIds;
    }

    if (allowedAssetIds && !allowedAssetIds.has(assetId)) {
      return NextResponse.json({ error: "Asset not found or access denied" }, { status: 404 });
    }

    const { data: asset, error: assetError } = await supabase
      .from("dam_assets")
      .select("id, filename, original_filename, file_type, auto_link_suggestions")
      .eq("id", assetId)
      .eq("organization_id", targetOrganizationId)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found or access denied" }, { status: 404 });
    }

    if (
      asset.auto_link_suggestions &&
      Array.isArray(asset.auto_link_suggestions) &&
      asset.auto_link_suggestions.length > 0
    ) {
      return NextResponse.json({
        success: true,
        data: asset.auto_link_suggestions,
        cached: true,
      });
    }

    let productsQuery = supabase
      .from("products")
      .select("id, sku, product_name, brand:brand_line")
      .eq("organization_id", targetOrganizationId)
      .in("status", ["Active", "active"]);

    if (allowedProductIds) {
      if (allowedProductIds.size === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          message: "No products available for linking",
        });
      }
      productsQuery = productsQuery.in("id", Array.from(allowedProductIds));
    }

    const { data: products, error: productsError } = await productsQuery;
    if (productsError) {
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "No products available for linking",
      });
    }

    const suggestions = generateProductLinkSuggestions(
      asset.original_filename || asset.filename,
      (products || []).map((product: any) => ({
        id: product.id,
        sku: product.sku || "",
        productName: product.product_name || "",
        brand: product.brand || "",
      }))
    );

    if (suggestions.length > 0 && context.mode !== "partner_brand") {
      await supabase
        .from("dam_assets")
        .update({
          auto_link_suggestions: suggestions,
          detected_skus: suggestions.map((s) => ({ sku: s.sku, confidence: s.confidence })),
        })
        .eq("id", assetId);
    }

    return NextResponse.json({
      success: true,
      data: suggestions,
      cached: false,
      asset: {
        id: asset.id,
        filename: asset.filename,
        file_type: asset.file_type,
      },
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantOrganization.slug,
      },
    });
  } catch (error) {
    console.error("Error in product-suggestions GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/assets/[assetId]/product-suggestions - Refresh product suggestions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const { tenant, assetId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite({ tenantSlug: tenant, selectedBrandSlug })) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const { getUser } = getKindeServerSession();
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { context } = contextResult;
    if (context.mode === "partner_brand") {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const targetOrganizationId = context.targetOrganization.id;
    const { data: asset, error: assetError } = await supabase
      .from("dam_assets")
      .select("id, filename, original_filename, file_type")
      .eq("id", assetId)
      .eq("organization_id", targetOrganizationId)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found or access denied" }, { status: 404 });
    }

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, sku, product_name, brand:brand_line")
      .eq("organization_id", targetOrganizationId)
      .in("status", ["Active", "active"]);

    if (productsError) {
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    const suggestions = generateProductLinkSuggestions(
      asset.original_filename || asset.filename,
      (products || []).map((product: any) => ({
        id: product.id,
        sku: product.sku || "",
        productName: product.product_name || "",
        brand: product.brand || "",
      }))
    );

    await supabase
      .from("dam_assets")
      .update({
        auto_link_suggestions: suggestions,
        detected_skus: suggestions.map((s) => ({ sku: s.sku, confidence: s.confidence })),
      })
      .eq("id", assetId);

    return NextResponse.json({
      success: true,
      data: suggestions,
      refreshed: true,
    });
  } catch (error) {
    console.error("Error in product-suggestions POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
