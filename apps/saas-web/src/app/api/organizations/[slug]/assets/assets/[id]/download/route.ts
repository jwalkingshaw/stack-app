import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { S3Service } from "@tradetool/storage";
import { supabaseServer } from "@/lib/supabase";
import { enforceCollectionScope } from "@/lib/collection-scope";
import { enforceRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { logRateLimitSecurityEvent } from "@/lib/security-audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const resolvedParams = await params;
    const rateLimit = await enforceRateLimit(request, {
      action: "org_asset_download_original",
      tenant: resolvedParams.slug,
      token: resolvedParams.id,
      windowSeconds: 60,
      maxRequests: 30,
    });
    if (!rateLimit.allowed) {
      await logRateLimitSecurityEvent(supabaseServer, {
        action: "org_asset_download_original",
        userAgent: request.headers.get("user-agent"),
        metadata: { slug: resolvedParams.slug, assetId: resolvedParams.id },
      });
      return rateLimitExceededResponse(rateLimit);
    }
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get("marketId");
    const channelId = searchParams.get("channelId");
    const collectionId = searchParams.get("collectionId");

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(resolvedParams.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [legacyCanDownload, canDownloadOriginal] = await Promise.all([
      authService.canDownloadAssets(user.id, organization.id),
      authService.hasScopedPermission({
        userId: user.id,
        organizationId: organization.id,
        permissionKey: ScopedPermission.AssetDownloadOriginal,
        marketId,
        channelId,
        collectionId,
      }),
    ]);

    if (!legacyCanDownload && !canDownloadOriginal) {
      return NextResponse.json(
        { error: "You don't have permission to download original assets" },
        { status: 403 }
      );
    }

    const collectionScope = await enforceCollectionScope({
      supabase: supabaseServer as any,
      organizationId: organization.id,
      collectionId,
      assetId: resolvedParams.id,
    });
    if (!collectionScope.ok) {
      return collectionScope.response;
    }

    // Get asset by ID
    const asset = await db.getAssetById(resolvedParams.id, organization.id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const s3Service = new S3Service();

    // Generate presigned download URL (5 days expiry)
    const downloadUrl = await s3Service.getPresignedDownloadUrl(asset.s3Key, 432000, {
      filename: asset.originalFilename,
      contentType: asset.mimeType,
      forceDownload: true,
    }); // 5 days = 432000 seconds

    return NextResponse.json({
      downloadUrl,
      filename: asset.originalFilename,
      contentType: asset.mimeType,
      fileSize: asset.fileSize,
    });
  } catch (error) {
    console.error("Failed to generate download URL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
