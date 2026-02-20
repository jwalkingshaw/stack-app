import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import {
  resolvePartnerGrantedAssetIds,
  resolvePartnerGrantedProductIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/assets/[assetId]/product-context - Get product relationships for an asset
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
      const grantedAssets = await resolvePartnerGrantedAssetIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
      });
      const grantedProducts = await resolvePartnerGrantedProductIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
      });

      if (grantedAssets.foundationAvailable && grantedProducts.foundationAvailable) {
        allowedAssetIds = new Set(grantedAssets.assetIds);
        allowedProductIds = new Set(grantedProducts.productIds);
      }
    }

    if (allowedAssetIds && !allowedAssetIds.has(assetId)) {
      return NextResponse.json({ error: "Asset not found or access denied" }, { status: 404 });
    }

    const { data: asset, error: assetError } = await supabase
      .from("dam_assets")
      .select(
        "id, filename, original_filename, file_type, product_identifiers, asset_scope, asset_type, tags"
      )
      .eq("id", assetId)
      .eq("organization_id", targetOrganizationId)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found or access denied" }, { status: 404 });
    }

    let linksQuery = supabase
      .from("product_asset_links")
      .select(
        `
          id,
          product_id,
          asset_type,
          link_context,
          confidence,
          match_reason,
          link_type,
          is_active,
          created_at,
          created_by,
          products!inner(id, sku, product_name, brand:brand_line, status)
        `
      )
      .eq("asset_id", assetId)
      .eq("organization_id", targetOrganizationId)
      .eq("is_active", true)
      .order("confidence", { ascending: false });

    if (allowedProductIds) {
      if (allowedProductIds.size === 0) {
        return NextResponse.json({
          success: true,
          data: {
            asset: {
              id: asset.id,
              filename: asset.filename,
              originalFilename: asset.original_filename,
              fileType: asset.file_type,
              productIdentifiers: asset.product_identifiers || [],
              assetScope: asset.asset_scope,
              assetType: asset.asset_type,
              tags: asset.tags || [],
            },
            productLinks: [],
            statistics: {
              totalLinks: 0,
              uniqueProducts: 0,
              contextStats: {},
              primaryContext: null,
              averageConfidence: 0,
            },
          },
        });
      }
      linksQuery = linksQuery.in("product_id", Array.from(allowedProductIds));
    }

    const { data: productLinks, error: linksError } = await linksQuery;
    if (linksError) {
      return NextResponse.json({ error: "Failed to fetch product context" }, { status: 500 });
    }

    const contextStats = ((productLinks || []) as any[]).reduce((acc: any, link: any) => {
      if (!acc[link.link_context]) {
        acc[link.link_context] = { count: 0, avgConfidence: 0, total: 0 };
      }
      acc[link.link_context].count++;
      acc[link.link_context].total += link.confidence;
      acc[link.link_context].avgConfidence =
        acc[link.link_context].total / acc[link.link_context].count;
      return acc;
    }, {});

    const formattedLinks = ((productLinks || []) as any[]).map((link: any) => ({
      id: link.id,
      productId: link.product_id,
      productName: link.products.product_name,
      sku: link.products.sku,
      brand: link.products.brand,
      linkContext: link.link_context,
      assetType: link.asset_type,
      confidence: link.confidence,
      matchReason: link.match_reason,
      linkType: link.link_type,
      createdAt: link.created_at,
      createdBy: link.created_by,
    }));

    const primaryContext = Object.entries(contextStats).sort(
      ([, a]: [string, any], [, b]: [string, any]) => b.avgConfidence - a.avgConfidence
    )[0]?.[0];

    return NextResponse.json({
      success: true,
      data: {
        asset: {
          id: asset.id,
          filename: asset.filename,
          originalFilename: asset.original_filename,
          fileType: asset.file_type,
          productIdentifiers: asset.product_identifiers || [],
          assetScope: asset.asset_scope,
          assetType: asset.asset_type,
          tags: asset.tags || [],
        },
        productLinks: formattedLinks,
        statistics: {
          totalLinks: formattedLinks.length,
          uniqueProducts: new Set(formattedLinks.map((link) => link.productId)).size,
          contextStats,
          primaryContext,
          averageConfidence:
            formattedLinks.length > 0
              ? formattedLinks.reduce((sum, link) => sum + link.confidence, 0) /
                formattedLinks.length
              : 0,
        },
      },
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantOrganization.slug,
      },
    });
  } catch (error) {
    console.error("Error in product-context GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
