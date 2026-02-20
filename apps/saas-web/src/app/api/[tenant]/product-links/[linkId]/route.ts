import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import {
  ASSET_VIEW_PERMISSION_KEYS,
  PRODUCT_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolveCollectionAssetIds,
  resolvePartnerGrantedAssetIds,
  resolvePartnerGrantedProductIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";
import { getChannelScopedProductIds } from "@/lib/product-channel-scope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type LinkReadConstraints = {
  allowedProductIds: Set<string> | null;
  allowedAssetIds: Set<string> | null;
  restrictToSharedAssetScope: boolean;
};

function isCrossTenantWrite(params: { tenantSlug: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenantSlug.trim().toLowerCase();
}

async function resolvePartnerLinkReadConstraints(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  brandMemberId: string | null;
}): Promise<LinkReadConstraints> {
  const { brandOrganizationId, partnerOrganizationId, brandMemberId } = params;

  const grantedProducts = await resolvePartnerGrantedProductIds({
    brandOrganizationId,
    partnerOrganizationId,
  });
  const grantedAssets = await resolvePartnerGrantedAssetIds({
    brandOrganizationId,
    partnerOrganizationId,
  });

  if (grantedProducts.foundationAvailable && grantedAssets.foundationAvailable) {
    return {
      allowedProductIds: new Set(grantedProducts.productIds),
      allowedAssetIds: new Set(grantedAssets.assetIds),
      restrictToSharedAssetScope: false,
    };
  }

  if (!brandMemberId) {
    return {
      allowedProductIds: new Set<string>(),
      allowedAssetIds: new Set<string>(),
      restrictToSharedAssetScope: false,
    };
  }

  const productScope = await getScopedPermissionSummary({
    organizationId: brandOrganizationId,
    memberId: brandMemberId,
    permissionKeys: PRODUCT_VIEW_PERMISSION_KEYS,
  });
  const assetScope = await getScopedPermissionSummary({
    organizationId: brandOrganizationId,
    memberId: brandMemberId,
    permissionKeys: ASSET_VIEW_PERMISSION_KEYS,
  });

  const hasAnyProductScope =
    productScope.hasOrganizationScope ||
    productScope.marketIds.length > 0 ||
    productScope.channelIds.length > 0;
  const hasAnyAssetScope =
    assetScope.hasOrganizationScope ||
    assetScope.collectionIds.length > 0 ||
    assetScope.marketIds.length > 0 ||
    assetScope.channelIds.length > 0;

  if (!hasAnyProductScope || !hasAnyAssetScope) {
    return {
      allowedProductIds: new Set<string>(),
      allowedAssetIds: new Set<string>(),
      restrictToSharedAssetScope: false,
    };
  }

  let allowedProductIds: Set<string> | null = null;
  if (!productScope.hasOrganizationScope && productScope.channelIds.length > 0) {
    const channelScoped = new Set<string>();
    for (const channelId of productScope.channelIds) {
      const scopedIds = await getChannelScopedProductIds({
        supabase: supabase as any,
        organizationId: brandOrganizationId,
        channelId,
      });
      for (const id of scopedIds || []) {
        channelScoped.add(id);
      }
    }
    allowedProductIds = channelScoped;
  }

  let allowedAssetIds: Set<string> | null = null;
  let restrictToSharedAssetScope = false;
  if (!assetScope.hasOrganizationScope) {
    if (assetScope.collectionIds.length > 0) {
      const scopedAssets = await resolveCollectionAssetIds({
        organizationId: brandOrganizationId,
        collectionIds: assetScope.collectionIds,
      });
      allowedAssetIds = new Set(scopedAssets);
    } else {
      restrictToSharedAssetScope = true;
    }
  }

  return {
    allowedProductIds,
    allowedAssetIds,
    restrictToSharedAssetScope,
  };
}

// DELETE /api/[tenant]/product-links/[linkId] - Remove product-asset link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; linkId: string }> }
) {
  try {
    const { tenant, linkId } = await params;
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

    const { context } = contextResult;
    if (context.mode === "partner_brand") {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const { getUser } = getKindeServerSession();
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetOrganizationId = context.targetOrganization.id;

    const { data: productLink, error: linkError } = await supabase
      .from("product_asset_links")
      .select(
        `
          id,
          asset_id,
          product_id,
          products!inner(sku),
          dam_assets!inner(id, product_identifiers)
        `
      )
      .eq("id", linkId)
      .eq("organization_id", targetOrganizationId)
      .single();

    if (linkError || !productLink) {
      return NextResponse.json({ error: "Product link not found or access denied" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("product_asset_links")
      .delete()
      .eq("id", linkId)
      .eq("organization_id", targetOrganizationId);

    if (deleteError) {
      return NextResponse.json({ error: "Failed to delete product-asset link" }, { status: 500 });
    }

    const typedLink = productLink as any;
    const { data: otherLinks } = await supabase
      .from("product_asset_links")
      .select("id")
      .eq("asset_id", typedLink.asset_id)
      .eq("product_id", typedLink.product_id)
      .eq("is_active", true);

    if (!otherLinks || otherLinks.length === 0) {
      const currentIdentifiers = typedLink.dam_assets?.product_identifiers || [];
      const productSku = typedLink.products?.sku;
      const updatedIdentifiers = Array.isArray(currentIdentifiers)
        ? currentIdentifiers.filter((sku: string) => sku !== productSku)
        : [];

      await supabase
        .from("dam_assets")
        .update({
          product_identifiers: updatedIdentifiers,
        })
        .eq("id", typedLink.asset_id);
    }

    return NextResponse.json({
      success: true,
      message: "Product-asset link deleted successfully",
    });
  } catch (error) {
    console.error("Error in product-links DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/[tenant]/product-links/[linkId] - Get specific product-asset link
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; linkId: string }> }
) {
  try {
    const { tenant, linkId } = await params;
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

    let constraints: LinkReadConstraints = {
      allowedProductIds: null,
      allowedAssetIds: null,
      restrictToSharedAssetScope: false,
    };
    if (context.mode === "partner_brand") {
      constraints = await resolvePartnerLinkReadConstraints({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
        brandMemberId: context.brandMemberId,
      });
      if (
        (constraints.allowedProductIds && constraints.allowedProductIds.size === 0) ||
        (constraints.allowedAssetIds && constraints.allowedAssetIds.size === 0)
      ) {
        return NextResponse.json({ error: "Product link not found or access denied" }, { status: 404 });
      }
    }

    const { data: productLink, error: linkError } = await supabase
      .from("product_asset_links")
      .select(
        `
          id,
          product_id,
          asset_id,
          asset_type,
          link_context,
          confidence,
          match_reason,
          link_type,
          is_active,
          created_at,
          products!inner(id, sku, product_name, brand:brand_line),
          dam_assets!inner(id, filename, file_type, mime_type, file_path, asset_scope)
        `
      )
      .eq("id", linkId)
      .eq("organization_id", targetOrganizationId)
      .single();

    if (linkError || !productLink) {
      return NextResponse.json({ error: "Product link not found or access denied" }, { status: 404 });
    }

    const typedLink = productLink as any;
    if (
      constraints.allowedProductIds &&
      !constraints.allowedProductIds.has(String(typedLink.product_id))
    ) {
      return NextResponse.json({ error: "Product link not found or access denied" }, { status: 404 });
    }
    if (constraints.allowedAssetIds && !constraints.allowedAssetIds.has(String(typedLink.asset_id))) {
      return NextResponse.json({ error: "Product link not found or access denied" }, { status: 404 });
    }
    if (
      constraints.restrictToSharedAssetScope &&
      String(typedLink?.dam_assets?.asset_scope || "").toLowerCase() !== "shared"
    ) {
      return NextResponse.json({ error: "Product link not found or access denied" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: typedLink,
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantOrganization.slug,
      },
    });
  } catch (error) {
    console.error("Error in product-links GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
