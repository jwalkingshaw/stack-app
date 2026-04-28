import { NextRequest, NextResponse } from "next/server";
import { S3Service } from "@stack-app/storage";
import { supabaseServer } from "@/lib/supabase";
import { cache as redisCache, CacheKeys, CacheTTL } from "@/lib/redis";
import { resolveStorageDeliveryUrl, rewriteStorageUrlToCloudFront } from "@/lib/storage-url";
import {
  ASSET_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolveCollectionAssetIds,
  resolvePartnerGrantedAssetIds,
  resolvePartnerSharedBrandOrganizationIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";

type AssetRow = {
  id: string;
  organization_id: string;
  asset_scope: string | null;
  s3_key: string | null;
  s3_url: string | null;
  mime_type: string | null;
  thumbnail_urls: Record<string, unknown> | null;
};

function extractUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolvePreferredPreviewUrl(asset: AssetRow): string | null {
  const thumbnailUrls =
    asset.thumbnail_urls && typeof asset.thumbnail_urls === "object"
      ? asset.thumbnail_urls
      : null;

  return (
    rewriteStorageUrlToCloudFront(extractUrl(thumbnailUrls?.medium)) ||
    rewriteStorageUrlToCloudFront(extractUrl(thumbnailUrls?.small)) ||
    resolveStorageDeliveryUrl({ s3Key: asset.s3_key, s3Url: extractUrl(asset.s3_url) })
  );
}

function redirectWithShortCache(url: string, maxAgeSeconds = 45) {
  const response = NextResponse.redirect(url, 307);
  response.headers.set(
    "Cache-Control",
    `private, max-age=${maxAgeSeconds}, stale-while-revalidate=120`
  );
  response.headers.set("Vary", "Cookie, Authorization");
  return response;
}

async function getAssetById(params: {
  assetId: string;
  organizationId: string;
}): Promise<AssetRow | null> {
  const { data, error } = await supabaseServer
    .from("dam_assets")
    .select("id,organization_id,asset_scope,s3_key,s3_url,mime_type,thumbnail_urls")
    .eq("id", params.assetId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as AssetRow;
}

// GET /api/[tenant]/assets/[assetId]/preview
// Returns a short-lived signed URL redirect for image previews.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const { tenant, assetId } = await params;
    const requestUrl = new URL(request.url);
    const selectedBrandSlug = requestUrl.searchParams.get("brand");
    const requestedViewScope = (requestUrl.searchParams.get("view") || "")
      .trim()
      .toLowerCase();
    const forceSigned = requestUrl.searchParams.get("signed") === "1";

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
      requestedViewScope === "all" &&
      context.mode === "tenant" &&
      context.tenantOrganization.organizationType === "partner";

    let asset: AssetRow | null = null;

    if (isPartnerAllViewRequest) {
      const tenantOrganizationId = context.tenantOrganization.id;
      const brandOrganizationIds = await resolvePartnerSharedBrandOrganizationIds({
        partnerOrganizationId: tenantOrganizationId,
      });
      const scopedOrganizationIds = [tenantOrganizationId, ...brandOrganizationIds];

      const { data: row, error: rowError } = await supabaseServer
        .from("dam_assets")
        .select("id,organization_id,asset_scope,s3_key,s3_url,mime_type,thumbnail_urls")
        .eq("id", assetId)
        .in("organization_id", scopedOrganizationIds)
        .maybeSingle();

      if (rowError || !row) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      if (row.organization_id !== tenantOrganizationId) {
        if (!row.organization_id) {
          return NextResponse.json({ error: "Asset not found" }, { status: 404 });
        }
        const granted = await resolvePartnerGrantedAssetIds({
          brandOrganizationId: row.organization_id,
          partnerOrganizationId: tenantOrganizationId,
        });

        if (!granted.foundationAvailable || !granted.assetIds.includes(assetId)) {
          return NextResponse.json({ error: "Asset not found" }, { status: 404 });
        }
      }

      asset = row as AssetRow;
    } else if (context.mode === "partner_brand") {
      const targetOrganizationId = context.targetOrganization.id;
      let restrictToSharedAssetScope = false;
      let collectionScopedAssetIds: Set<string> | null = null;

      const grantedSetAssets = await resolvePartnerGrantedAssetIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
      });

      if (grantedSetAssets.foundationAvailable) {
        if (!grantedSetAssets.assetIds.includes(assetId)) {
          return NextResponse.json({ error: "Asset not found" }, { status: 404 });
        }
      } else {
        if (!context.brandMemberId) {
          return NextResponse.json({ error: "Asset not found" }, { status: 404 });
        }

        const scopedPermissions = await getScopedPermissionSummary({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
          permissionKeys: ASSET_VIEW_PERMISSION_KEYS,
        });

        const hasAnyAssetScope =
          scopedPermissions.hasOrganizationScope ||
          scopedPermissions.collectionIds.length > 0 ||
          scopedPermissions.marketIds.length > 0 ||
          scopedPermissions.channelIds.length > 0;

        if (!hasAnyAssetScope) {
          return NextResponse.json({ error: "Asset not found" }, { status: 404 });
        }

        if (!scopedPermissions.hasOrganizationScope && scopedPermissions.collectionIds.length > 0) {
          const collectionAssetIds = await resolveCollectionAssetIds({
            organizationId: targetOrganizationId,
            collectionIds: scopedPermissions.collectionIds,
          });
          collectionScopedAssetIds = new Set(collectionAssetIds);
        } else if (!scopedPermissions.hasOrganizationScope) {
          // Legacy fallback: invite-level share without explicit collection scope.
          restrictToSharedAssetScope = true;
        }
      }

      asset = await getAssetById({
        assetId,
        organizationId: targetOrganizationId,
      });
      if (!asset) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      if (collectionScopedAssetIds && !collectionScopedAssetIds.has(asset.id)) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      if (restrictToSharedAssetScope && (asset.asset_scope || "").toLowerCase() !== "shared") {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
    } else {
      asset = await getAssetById({
        assetId,
        organizationId: context.targetOrganization.id,
      });
      if (!asset) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
    }

    const previewScopeDescriptor = [
      `tenant=${tenant}`,
      `asset=${asset.id}`,
      `tenantOrg=${context.tenantOrganization.id}`,
      `targetOrg=${context.targetOrganization.id}`,
      `mode=${context.mode}`,
      `brand=${context.selectedBrandSlug || "-"}`,
      `view=${requestedViewScope || "-"}`,
      `forceSigned=${forceSigned ? "1" : "0"}`,
    ].join("|");
    const previewScopeKey = Buffer.from(previewScopeDescriptor).toString("base64url");
    const previewCacheKey = CacheKeys.assetPreview(asset.id, previewScopeKey);

    const cachedRedirect = await redisCache.get<string>(previewCacheKey);
    if (cachedRedirect) {
      return redirectWithShortCache(cachedRedirect, 30);
    }

    const fallbackUrl = resolvePreferredPreviewUrl(asset);

    if (!asset.s3_key) {
      if (fallbackUrl) {
        await redisCache.set(previewCacheKey, fallbackUrl, CacheTTL.ASSET_PREVIEW_FALLBACK);
        return redirectWithShortCache(fallbackUrl, 60);
      }
      return NextResponse.json({ error: "Preview unavailable" }, { status: 404 });
    }

    if (!forceSigned && fallbackUrl) {
      await redisCache.set(previewCacheKey, fallbackUrl, CacheTTL.ASSET_PREVIEW_FALLBACK);
      return redirectWithShortCache(fallbackUrl, 60);
    }

    try {
      const s3Service = new S3Service();
      const signedPreviewUrl = await s3Service.getPresignedDownloadUrl(asset.s3_key, 900, {
        contentType: asset.mime_type || undefined,
        forceDownload: false,
      });
      await redisCache.set(previewCacheKey, signedPreviewUrl, CacheTTL.ASSET_PREVIEW_SIGNED);
      return redirectWithShortCache(signedPreviewUrl, 30);
    } catch (error) {
      if (fallbackUrl) {
        await redisCache.set(previewCacheKey, fallbackUrl, CacheTTL.ASSET_PREVIEW_FALLBACK);
        return redirectWithShortCache(fallbackUrl, 60);
      }
      console.error("Failed to resolve signed preview URL:", error);
      return NextResponse.json({ error: "Preview unavailable" }, { status: 500 });
    }
  } catch (error) {
    console.error("GET /assets/[assetId]/preview failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
