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

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isCrossTenantWrite(params: { tenantSlug: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenantSlug.trim().toLowerCase();
}

function emptyLinksResponse() {
  return NextResponse.json({
    success: true,
    data: [],
  });
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

// POST /api/[tenant]/product-links - Create product-asset link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
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

    const body = await request.json().catch(() => ({}));
    const {
      product_id,
      asset_id,
      asset_type,
      link_context,
      confidence,
      match_reason,
      link_type = "auto",
      product_field_id,
      channel_id,
      market_id,
      destination_id,
      locale_id,
      document_slot_code,
      is_primary,
      document_expiry_date,
      replace_existing_slot = true,
    } = body;

    if (!product_id || !asset_id || !link_context) {
      return NextResponse.json(
        { error: "Product ID, Asset ID, and link context are required" },
        { status: 400 }
      );
    }

    const targetOrganizationId = context.targetOrganization.id;

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, sku, product_name")
      .eq("id", product_id)
      .eq("organization_id", targetOrganizationId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 404 });
    }

    const { data: asset, error: assetError } = await supabase
      .from("dam_assets")
      .select("id, filename")
      .eq("id", asset_id)
      .eq("organization_id", targetOrganizationId)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found or access denied" }, { status: 404 });
    }

    const cleanDocumentSlotCode = normalizeOptionalText(document_slot_code);
    const cleanProductFieldId = normalizeOptionalText(product_field_id);
    const cleanChannelId = normalizeOptionalText(channel_id);
    const cleanMarketId = normalizeOptionalText(market_id);
    const cleanDestinationId = normalizeOptionalText(destination_id);
    const cleanLocaleId = normalizeOptionalText(locale_id);
    const cleanDocumentExpiryDate = normalizeOptionalText(document_expiry_date);

    if (cleanDocumentSlotCode && replace_existing_slot) {
      let replaceQuery = supabase
        .from("product_asset_links")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", targetOrganizationId)
        .eq("product_id", product_id)
        .eq("document_slot_code", cleanDocumentSlotCode)
        .eq("is_active", true);

      if (cleanChannelId) {
        replaceQuery = replaceQuery.eq("channel_id", cleanChannelId);
      } else {
        replaceQuery = replaceQuery.is("channel_id", null);
      }
      if (cleanMarketId) {
        replaceQuery = replaceQuery.eq("market_id", cleanMarketId);
      } else {
        replaceQuery = replaceQuery.is("market_id", null);
      }
      if (cleanDestinationId) {
        replaceQuery = replaceQuery.eq("destination_id", cleanDestinationId);
      } else {
        replaceQuery = replaceQuery.is("destination_id", null);
      }
      if (cleanLocaleId) {
        replaceQuery = replaceQuery.eq("locale_id", cleanLocaleId);
      } else {
        replaceQuery = replaceQuery.is("locale_id", null);
      }

      const { error: replaceError } = await replaceQuery;
      if (replaceError) {
        return NextResponse.json(
          { error: "Failed to replace existing slot assignment" },
          { status: 500 }
        );
      }
    }

    const { data: productLink, error: linkError } = await supabase
      .from("product_asset_links")
      .insert({
        organization_id: targetOrganizationId,
        product_id,
        asset_id,
        asset_type,
        link_context,
        confidence: confidence || 0.5,
        match_reason: match_reason || "Manual link",
        link_type,
        product_field_id: cleanProductFieldId,
        channel_id: cleanChannelId,
        market_id: cleanMarketId,
        destination_id: cleanDestinationId,
        locale_id: cleanLocaleId,
        document_slot_code: cleanDocumentSlotCode,
        is_primary: Boolean(is_primary),
        document_expiry_date: cleanDocumentExpiryDate,
        is_active: true,
        created_by: user.id,
      })
      .select(
        "id,asset_type,link_context,confidence,match_reason,link_type,product_field_id,channel_id,market_id,destination_id,locale_id,document_slot_code,is_primary,document_expiry_date,is_active,created_at"
      )
      .single();

    if (linkError) {
      if (linkError.code === "23505") {
        return NextResponse.json(
          { error: "This product-asset link already exists for this context" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Failed to create product-asset link" }, { status: 500 });
    }

    const currentProductIdentifiers = await supabase
      .from("dam_assets")
      .select("product_identifiers")
      .eq("id", asset_id)
      .single();

    if (currentProductIdentifiers.data) {
      const identifiers = currentProductIdentifiers.data.product_identifiers || [];
      if (product.sku && !identifiers.includes(product.sku)) {
        await supabase
          .from("dam_assets")
          .update({
            product_identifiers: [...identifiers, product.sku],
          })
          .eq("id", asset_id);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...productLink,
          product: {
            id: product.id,
            sku: product.sku,
            product_name: product.product_name,
          },
          asset: {
            id: asset.id,
            filename: asset.filename,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in product-links POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/[tenant]/product-links - Get product-asset links with filters
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const requestUrl = new URL(request.url);
    const selectedBrandSlug = requestUrl.searchParams.get("brand");

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
    const productId = requestUrl.searchParams.get("product_id");
    const assetId = requestUrl.searchParams.get("asset_id");
    const linkContext = requestUrl.searchParams.get("link_context");
    const documentSlotCode = requestUrl.searchParams.get("document_slot_code");

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
        return emptyLinksResponse();
      }
    }

    let query = supabase
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
          product_field_id,
          channel_id,
          market_id,
          destination_id,
          locale_id,
          document_slot_code,
          is_primary,
          document_expiry_date,
          is_active,
          created_at,
          products!inner(id, sku, product_name, brand:brand_line),
          dam_assets!inner(
            id,
            filename,
            original_filename,
            file_type,
            mime_type,
            thumbnail_urls,
            s3_url,
            file_path,
            asset_scope,
            updated_at,
            current_version_changed_at,
            current_version_number
          )
        `
      )
      .eq("organization_id", targetOrganizationId)
      .eq("is_active", true);

    if (productId) {
      query = query.eq("product_id", productId);
    }
    if (assetId) {
      query = query.eq("asset_id", assetId);
    }
    if (linkContext) {
      query = query.eq("link_context", linkContext);
    }
    if (documentSlotCode) {
      query = query.eq("document_slot_code", documentSlotCode);
    }
    if (constraints.allowedProductIds) {
      query = query.in("product_id", Array.from(constraints.allowedProductIds));
    }
    if (constraints.allowedAssetIds) {
      query = query.in("asset_id", Array.from(constraints.allowedAssetIds));
    }

    const { data: productLinks, error: linksError } = await query.order("created_at", {
      ascending: false,
    });

    if (linksError) {
      return NextResponse.json({ error: "Failed to fetch product-asset links" }, { status: 500 });
    }

    const filteredLinks = constraints.restrictToSharedAssetScope
      ? ((productLinks || []) as any[]).filter(
          (row) => String(row?.dam_assets?.asset_scope || "").toLowerCase() === "shared"
        )
      : productLinks || [];

    return NextResponse.json({
      success: true,
      data: filteredLinks,
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
