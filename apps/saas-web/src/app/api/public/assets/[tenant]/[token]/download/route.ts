import { NextRequest, NextResponse } from "next/server";
import { DatabaseQueries } from "@tradetool/database";
import { S3Service } from "@tradetool/storage";
import { supabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { enforceRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { logRateLimitSecurityEvent } from "@/lib/security-audit";

type AssetRow = {
  id: string;
  original_filename: string;
  mime_type: string;
  s3_key: string;
};

const isShareExpired = (expiresAt?: string) => {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now();
};

type ShareLookup = {
  asset: AssetRow;
  publicEnabled: boolean;
  allowDownloads: boolean;
  expiresAt: string;
};

const findSharedAsset = async (tenant: string, token: string): Promise<ShareLookup | null> => {
  const db = new DatabaseQueries(supabaseServer);
  const org = await db.getOrganizationBySlug(tenant);
  if (!org) return null;

  const { data: shareRow } = await (supabaseServer as any)
    .from("asset_shares")
    .select("asset_id, public_enabled, allow_downloads, expires_at")
    .eq("organization_id", org.id)
    .eq("token", token)
    .maybeSingle();
  if (!shareRow) {
    return null;
  }

  const { data: assetRow } = await (supabaseServer as any)
    .from("dam_assets")
    .select("id, original_filename, mime_type, s3_key")
    .eq("organization_id", org.id)
    .eq("id", (shareRow as any).asset_id)
    .maybeSingle();
  if (!assetRow) {
    return null;
  }

  return {
    asset: assetRow as AssetRow,
    publicEnabled: Boolean((shareRow as any).public_enabled),
    allowDownloads: Boolean((shareRow as any).allow_downloads),
    expiresAt: String((shareRow as any).expires_at),
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; token: string }> }
) {
  try {
    const { tenant, token } = await params;
    const rateLimit = await enforceRateLimit(request, {
      action: "public_asset_download_token",
      tenant,
      token,
      windowSeconds: 60,
      maxRequests: 20,
    });
    if (!rateLimit.allowed) {
      await logRateLimitSecurityEvent(supabaseServer, {
        action: "public_asset_download_token",
        userAgent: request.headers.get("user-agent"),
        metadata: { tenant, tokenPrefix: token.slice(0, 8) },
      });
      return rateLimitExceededResponse(rateLimit);
    }

    const share = await findSharedAsset(tenant, token);
    if (!share) {
      return NextResponse.json({ error: "Shared asset not found" }, { status: 404 });
    }

    if (isShareExpired(share.expiresAt)) {
      return NextResponse.json({ error: "Shared link has expired" }, { status: 410 });
    }

    const publicEnabled = share.publicEnabled;
    if (!publicEnabled) {
      const tenantAccess = await requireTenantAccess(request, tenant);
      if (!tenantAccess.ok) {
        return tenantAccess.response;
      }
    }

    const allowDownloads = share.allowDownloads;
    if (!allowDownloads) {
      return NextResponse.json({ error: "Downloads are disabled for this link" }, { status: 403 });
    }

    const s3Service = new S3Service();
    const downloadUrl = await s3Service.getPresignedDownloadUrl(share.asset.s3_key, 300, {
      filename: share.asset.original_filename,
      contentType: share.asset.mime_type,
      forceDownload: true,
    });
    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error) {
    console.error("[public asset download] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
