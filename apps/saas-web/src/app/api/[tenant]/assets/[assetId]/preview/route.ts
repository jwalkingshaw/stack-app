import { NextRequest, NextResponse } from "next/server";
import { S3Service } from "@tradetool/storage";
import { supabaseServer } from "@/lib/supabase";
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

async function getAssetById(params: {
  assetId: string;
  organizationId: string;
}): Promise<AssetRow | null> {
  const { data, error } = await (supabaseServer as any)
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
      const brandOrganizationIds = await resolvePartnerSharedBrandOrganizationIds({
        partnerOrganizationId: context.tenantOrganization.id,
      });
      if (brandOrganizationIds.length === 0) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      const { data: row, error: rowError } = await (supabaseServer as any)
        .from("dam_assets")
        .select("id,organization_id,asset_scope,s3_key,s3_url,mime_type,thumbnail_urls")
        .eq("id", assetId)
        .in("organization_id", brandOrganizationIds)
        .maybeSingle();

      if (rowError || !row) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      const granted = await resolvePartnerGrantedAssetIds({
        brandOrganizationId: row.organization_id,
        partnerOrganizationId: context.tenantOrganization.id,
      });

      if (!granted.foundationAvailable || !granted.assetIds.includes(assetId)) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
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

    const thumbnailUrls =
      asset.thumbnail_urls && typeof asset.thumbnail_urls === "object"
        ? asset.thumbnail_urls
        : null;
    const fallbackUrl =
      extractUrl(thumbnailUrls?.medium) ||
      extractUrl(thumbnailUrls?.small) ||
      extractUrl(asset.s3_url);

    if (!asset.s3_key) {
      if (fallbackUrl) {
        return NextResponse.redirect(fallbackUrl, 307);
      }
      return NextResponse.json({ error: "Preview unavailable" }, { status: 404 });
    }

    try {
      const s3Service = new S3Service();
      const signedPreviewUrl = await s3Service.getPresignedDownloadUrl(asset.s3_key, 900, {
        contentType: asset.mime_type || undefined,
        forceDownload: false,
      });
      return NextResponse.redirect(signedPreviewUrl, 307);
    } catch (error) {
      if (fallbackUrl) {
        return NextResponse.redirect(fallbackUrl, 307);
      }
      console.error("Failed to resolve signed preview URL:", error);
      return NextResponse.json({ error: "Preview unavailable" }, { status: 500 });
    }
  } catch (error) {
    console.error("GET /assets/[assetId]/preview failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
