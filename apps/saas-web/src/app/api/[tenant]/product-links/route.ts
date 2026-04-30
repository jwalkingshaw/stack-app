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
import {
  resolveStorageDeliveryUrl,
  rewriteThumbnailUrls,
} from "@/lib/storage-url";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type LinkReadConstraints = {
  allowedProductIds: Set<string> | null;
  allowedAssetIds: Set<string> | null;
  restrictToSharedAssetScope: boolean;
};

type DamAssetLinkRecord = {
  asset_scope?: string | null;
  s3_key?: string | null;
  s3_url?: string | null;
  thumbnail_urls?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type ProductLinkRow = {
  dam_assets:
    | DamAssetLinkRecord
    | Array<DamAssetLinkRecord>
    | null;
  [key: string]: unknown;
};

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseRequestedProductIds(searchParams: URLSearchParams): string[] {
  const rawValues = searchParams.getAll("product_ids");
  if (rawValues.length === 0) return [];

  const deduped = new Set<string>();
  for (const rawValue of rawValues) {
    const parts = String(rawValue || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    for (const value of parts) {
      deduped.add(value);
      if (deduped.size >= 250) {
        return Array.from(deduped);
      }
    }
  }

  return Array.from(deduped);
}

function parseRequestedDocumentSlotCodes(searchParams: URLSearchParams): string[] {
  const rawValues = searchParams.getAll("document_slot_codes");
  if (rawValues.length === 0) return [];

  const deduped = new Set<string>();
  for (const rawValue of rawValues) {
    const parts = String(rawValue || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    for (const value of parts) {
      deduped.add(value);
      if (deduped.size >= 20) {
        return Array.from(deduped);
      }
    }
  }

  return Array.from(deduped);
}

function normalizeDamAssetUrls(asset: DamAssetLinkRecord): DamAssetLinkRecord {
  const normalizedS3Url = normalizeOptionalText(asset.s3_url);
  const resolvedS3Url = resolveStorageDeliveryUrl({
    s3Key: normalizeOptionalText(asset.s3_key),
    s3Url: normalizedS3Url,
  });

  return {
    ...asset,
    s3_url: resolvedS3Url,
    thumbnail_urls: rewriteThumbnailUrls(asset.thumbnail_urls),
  };
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
    // allowedProductIds already scopes every row in product_asset_links — every link has a
    // product_id. Do not add a separate allowedAssetIds filter here: if the partner has only
    // product share set grants (no asset share sets), grantedAssets.assetIds is empty, and
    // applying that empty set would block all product-linked assets. Asset visibility through
    // this route is fully bounded by the product grant; asset share sets govern standalone DAM
    // access, not product-linked images.
    return {
      allowedProductIds: new Set(grantedProducts.productIds),
      allowedAssetIds: null,
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
        supabase: supabase,
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
      variant_id,
      document_lot_number,
      document_version,
      sort_order,
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
    const cleanVariantId = normalizeOptionalText(variant_id);
    const cleanDocumentLotNumber = normalizeOptionalText(document_lot_number);
    const cleanDocumentVersion = normalizeOptionalText(document_version);
    const cleanSortOrder = typeof sort_order === "number" && Number.isFinite(sort_order) ? Math.floor(sort_order) : null;

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
      if (cleanVariantId) {
        replaceQuery = replaceQuery.eq("variant_id", cleanVariantId);
      } else {
        replaceQuery = replaceQuery.is("variant_id", null);
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
        variant_id: cleanVariantId,
        document_lot_number: cleanDocumentLotNumber,
        document_version: cleanDocumentVersion,
        sort_order: cleanSortOrder,
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
    let requestedProductIds = parseRequestedProductIds(requestUrl.searchParams);
    const assetId = requestUrl.searchParams.get("asset_id");
    const linkContext = requestUrl.searchParams.get("link_context");
    const documentSlotCode = requestUrl.searchParams.get("document_slot_code");
    const requestedDocumentSlotCodes = parseRequestedDocumentSlotCodes(requestUrl.searchParams);
    const variantIdFilter = requestUrl.searchParams.get("variant_id");

    if (productId) {
      if (requestedProductIds.length > 0 && !requestedProductIds.includes(productId)) {
        return emptyLinksResponse();
      }
      requestedProductIds = [productId];
    }

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

    if (constraints.allowedProductIds && requestedProductIds.length > 0) {
      const allowedProductIds = constraints.allowedProductIds;
      requestedProductIds = requestedProductIds.filter((id) =>
        allowedProductIds.has(id)
      );
      if (requestedProductIds.length === 0) {
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
          variant_id,
          document_lot_number,
          document_version,
          approved_for_market_ids,
          sort_order,
          is_primary,
          document_expiry_date,
          is_active,
          created_at,
          products!product_asset_links_product_id_fkey(id, sku, product_name, brand:brand_line),
          dam_assets!inner(
            id,
            filename,
            original_filename,
            file_type,
            mime_type,
            thumbnail_urls,
            s3_key,
            s3_url,
            file_path,
            asset_scope,
            folder_id,
            updated_at,
            current_version_changed_at,
            current_version_number
          )
        `
      )
      .eq("organization_id", targetOrganizationId)
      .eq("is_active", true);

    if (requestedProductIds.length > 0) {
      query = query.in("product_id", requestedProductIds);
    }
    if (assetId) {
      query = query.eq("asset_id", assetId);
    }
    if (linkContext) {
      query = query.eq("link_context", linkContext);
    }
    if (documentSlotCode) {
      query = query.eq("document_slot_code", documentSlotCode);
    } else if (requestedDocumentSlotCodes.length > 0) {
      query = query.in("document_slot_code", requestedDocumentSlotCodes);
    }
    if (variantIdFilter) {
      query = query.eq("variant_id", variantIdFilter);
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
      console.error("product-links GET linksError:", linksError.message, linksError.details, linksError.hint);
      return NextResponse.json({ error: "Failed to fetch product-asset links", detail: linksError.message }, { status: 500 });
    }

    const linkRows = (productLinks || []) as ProductLinkRow[];
    const filteredLinks = constraints.restrictToSharedAssetScope
      ? linkRows.filter((row) => {
          const assetRow = Array.isArray(row.dam_assets) ? row.dam_assets[0] : row.dam_assets;
          const scope =
            assetRow && typeof assetRow === "object" ? assetRow.asset_scope : null;
          return String(scope || "").toLowerCase() === "shared";
        })
      : linkRows;

    const normalizedLinks = filteredLinks.map((row) => {
      const assetRow = row.dam_assets;
      if (!assetRow || typeof assetRow !== "object") {
        return row;
      }

      if (Array.isArray(assetRow)) {
        return {
          ...row,
          dam_assets: assetRow.map((asset) => normalizeDamAssetUrls(asset)),
        };
      }

      return {
        ...row,
        dam_assets: normalizeDamAssetUrls(assetRow),
      };
    });

    return NextResponse.json({
      success: true,
      data: normalizedLinks,
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

