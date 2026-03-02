import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { evaluateScopedPermission } from "@/lib/security-permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type AssetRow = {
  id: string;
  organization_id: string;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  s3_key: string;
  s3_url: string;
  thumbnail_urls: Record<string, any> | null;
  metadata: Record<string, any> | null;
  tags: string[] | null;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  current_version_number: number | null;
  current_version_comment: string | null;
  current_version_effective_from: string | null;
  current_version_effective_to: string | null;
  current_version_changed_by: string | null;
  current_version_changed_at: string | null;
};

type HistoricalVersionRow = {
  id: string;
  version_number: number;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  s3_key: string;
  s3_url: string;
  thumbnail_urls: Record<string, any> | null;
  metadata: Record<string, any> | null;
  tags: string[] | null;
  description: string | null;
  change_comment: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string;
  created_at: string;
};

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function normalizeOptionalIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function canManageAssetVersions(params: {
  userId: string;
  organizationId: string;
}) {
  const db = new DatabaseQueries(supabase as any);
  const authService = new AuthService(db);
  const [hasVersionManage, hasUploadPermission] = await Promise.all([
    evaluateScopedPermission({
      authService,
      userId: params.userId,
      organizationId: params.organizationId,
      permissionKey: ScopedPermission.AssetVersionManage,
    }),
    evaluateScopedPermission({
      authService,
      userId: params.userId,
      organizationId: params.organizationId,
      permissionKey: ScopedPermission.AssetUpload,
    }),
  ]);
  return hasVersionManage || hasUploadPermission;
}

async function fetchAssetForVersioning(params: { assetId: string; organizationId: string }) {
  const { data: existingAsset, error } = await (supabase as any)
    .from("dam_assets")
    .select(
      `
        id,
        organization_id,
        filename,
        original_filename,
        file_type,
        file_size,
        mime_type,
        s3_key,
        s3_url,
        thumbnail_urls,
        metadata,
        tags,
        description,
        created_by,
        created_at,
        updated_at,
        current_version_number,
        current_version_comment,
        current_version_effective_from,
        current_version_effective_to,
        current_version_changed_by,
        current_version_changed_at
      `
    )
    .eq("id", params.assetId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (error || !existingAsset) {
    return null;
  }

  return existingAsset as AssetRow;
}

// POST /api/[tenant]/assets/[assetId]/versions/restore
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const { tenant, assetId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenant, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const tenantAccess = await requireTenantAccess(request, tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canManageVersions = await canManageAssetVersions({
      userId,
      organizationId: organization.id,
    });
    if (!canManageVersions) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to restore asset versions." },
        { status: 403 }
      );
    }

    const existingAsset = await fetchAssetForVersioning({
      assetId,
      organizationId: organization.id,
    });
    if (!existingAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const versionId =
      typeof body.versionId === "string" && body.versionId.trim().length > 0
        ? body.versionId.trim()
        : null;
    if (!versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    const restoreCommentRaw =
      typeof body.comment === "string" && body.comment.trim().length > 0
        ? body.comment.trim()
        : null;
    const restoreEffectiveFrom = normalizeOptionalIsoDate(body.effectiveFrom);
    const restoreEffectiveTo = normalizeOptionalIsoDate(body.effectiveTo);
    if (
      restoreEffectiveFrom &&
      restoreEffectiveTo &&
      new Date(restoreEffectiveTo) < new Date(restoreEffectiveFrom)
    ) {
      return NextResponse.json(
        { error: "Effective end date must be on or after the start date." },
        { status: 400 }
      );
    }

    const { data: selectedVersion, error: selectedVersionError } = await (supabase as any)
      .from("dam_asset_versions")
      .select(
        `
          id,
          version_number,
          filename,
          original_filename,
          file_type,
          file_size,
          mime_type,
          s3_key,
          s3_url,
          thumbnail_urls,
          metadata,
          tags,
          description,
          change_comment,
          effective_from,
          effective_to,
          created_by,
          created_at
        `
      )
      .eq("organization_id", organization.id)
      .eq("asset_id", assetId)
      .eq("id", versionId)
      .maybeSingle();

    if (selectedVersionError || !selectedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const historicalVersion = selectedVersion as HistoricalVersionRow;
    const currentVersionNumber = Math.max(1, Number(existingAsset.current_version_number || 1));
    const nowIso = new Date().toISOString();

    const snapshotCurrentVersion = {
      organization_id: organization.id,
      asset_id: existingAsset.id,
      version_number: currentVersionNumber,
      filename: existingAsset.filename,
      original_filename: existingAsset.original_filename,
      file_type: existingAsset.file_type,
      file_size: existingAsset.file_size,
      mime_type: existingAsset.mime_type,
      s3_key: existingAsset.s3_key,
      s3_url: existingAsset.s3_url,
      thumbnail_urls: existingAsset.thumbnail_urls || {},
      metadata: existingAsset.metadata || {},
      tags: existingAsset.tags || [],
      description: existingAsset.description,
      change_comment: existingAsset.current_version_comment,
      effective_from: existingAsset.current_version_effective_from,
      effective_to: existingAsset.current_version_effective_to,
      created_by: existingAsset.current_version_changed_by || existingAsset.created_by,
      created_at:
        existingAsset.current_version_changed_at ||
        existingAsset.updated_at ||
        existingAsset.created_at,
    };

    const { data: insertedSnapshot, error: snapshotError } = await (supabase as any)
      .from("dam_asset_versions")
      .insert(snapshotCurrentVersion)
      .select("id")
      .single();

    if (snapshotError) {
      if (snapshotError.code === "23505") {
        return NextResponse.json(
          { error: "This asset was updated by another request. Refresh and try again." },
          { status: 409 }
        );
      }
      console.error("POST /versions/restore snapshot insert failed:", snapshotError);
      return NextResponse.json({ error: "Failed to snapshot current version" }, { status: 500 });
    }

    const restoreComment =
      restoreCommentRaw || `Restored from version v${historicalVersion.version_number}`;

    const { data: updatedAsset, error: updateError } = await (supabase as any)
      .from("dam_assets")
      .update({
        filename: historicalVersion.filename,
        original_filename: historicalVersion.original_filename,
        file_type: historicalVersion.file_type,
        file_size: historicalVersion.file_size,
        mime_type: historicalVersion.mime_type,
        s3_key: historicalVersion.s3_key,
        s3_url: historicalVersion.s3_url,
        thumbnail_urls: historicalVersion.thumbnail_urls || {},
        metadata: historicalVersion.metadata || {},
        tags: historicalVersion.tags || [],
        description: historicalVersion.description,
        current_version_number: currentVersionNumber + 1,
        current_version_comment: restoreComment,
        current_version_effective_from:
          restoreEffectiveFrom || historicalVersion.effective_from || null,
        current_version_effective_to:
          restoreEffectiveTo || historicalVersion.effective_to || null,
        current_version_changed_by: userId,
        current_version_changed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", assetId)
      .eq("organization_id", organization.id)
      .select()
      .single();

    if (updateError || !updatedAsset) {
      console.error("POST /versions/restore asset update failed:", updateError);
      await (supabase as any)
        .from("dam_asset_versions")
        .delete()
        .eq("id", insertedSnapshot.id)
        .eq("organization_id", organization.id);
      return NextResponse.json({ error: "Failed to restore selected version" }, { status: 500 });
    }

    return NextResponse.json({
      data: updatedAsset,
      message: "Version restored successfully",
    });
  } catch (error) {
    console.error("POST /versions/restore failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
