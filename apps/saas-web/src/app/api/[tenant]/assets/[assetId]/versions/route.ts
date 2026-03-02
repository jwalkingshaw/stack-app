import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { evaluateScopedPermission } from "@/lib/security-permissions";
import { S3Service } from "@tradetool/storage";
import { getOrganizationBillingLimits } from "@/lib/billing-policy";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const FREE_PLAN_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const EXTENSION_MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function inferMimeTypeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  const extension = Object.keys(EXTENSION_MIME_MAP).find((ext) => lower.endsWith(ext));
  return extension ? EXTENSION_MIME_MAP[extension] : null;
}

function isDocumentMimeType(mimeType: string): boolean {
  const value = String(mimeType || "").toLowerCase();
  return (
    value.includes("pdf") ||
    value.startsWith("text/") ||
    value.includes("msword") ||
    value.includes("officedocument.wordprocessingml") ||
    value.includes("ms-excel") ||
    value.includes("officedocument.spreadsheetml")
  );
}

function isImageMimeType(mimeType: string): boolean {
  return String(mimeType || "").toLowerCase().startsWith("image/");
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function normalizeOptionalDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function resolveAssetFileType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (isDocumentMimeType(mimeType)) return "document";
  return "other";
}

function extractUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type VersionRow = {
  id: string;
  version_number: number;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  s3_key: string | null;
  s3_url: string;
  thumbnail_urls: Record<string, unknown> | null;
  change_comment: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string;
  created_at: string;
};

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

function mapVersionHistoryRows(params: {
  versions: VersionRow[];
  currentAsset: AssetRow;
}) {
  const historicalRows = params.versions.map((row) => ({
    id: row.id,
    versionNumber: row.version_number,
    filename: row.filename,
    originalFilename: row.original_filename,
    fileType: row.file_type,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    s3Key: row.s3_key,
    s3Url: row.s3_url,
    thumbnailUrls: row.thumbnail_urls,
    changeComment: row.change_comment,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    changedBy: row.created_by,
    changedAt: row.created_at,
    isCurrent: false,
  }));

  const currentVersionNumber = Number(params.currentAsset.current_version_number || 1);
  const currentRow = {
    id: `current-${params.currentAsset.id}`,
    versionNumber: currentVersionNumber,
    filename: params.currentAsset.filename,
    originalFilename: params.currentAsset.original_filename,
    fileType: params.currentAsset.file_type,
    fileSize: params.currentAsset.file_size,
    mimeType: params.currentAsset.mime_type,
    s3Key: params.currentAsset.s3_key,
    s3Url: params.currentAsset.s3_url,
    thumbnailUrls: params.currentAsset.thumbnail_urls,
    changeComment: params.currentAsset.current_version_comment,
    effectiveFrom: params.currentAsset.current_version_effective_from,
    effectiveTo: params.currentAsset.current_version_effective_to,
    changedBy: params.currentAsset.current_version_changed_by || params.currentAsset.created_by,
    changedAt:
      params.currentAsset.current_version_changed_at ||
      params.currentAsset.updated_at ||
      params.currentAsset.created_at,
    isCurrent: true,
  };

  return [currentRow, ...historicalRows].sort((a, b) => b.versionNumber - a.versionNumber);
}

async function attachVersionPreviewUrls(
  rows: Array<{
    id: string;
    versionNumber: number;
    filename: string;
    originalFilename: string;
    fileType: string;
    fileSize: number;
    mimeType: string;
    s3Key: string | null;
    s3Url: string | null;
    thumbnailUrls: Record<string, unknown> | null;
    changeComment: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    changedBy: string | null;
    changedAt: string | null;
    isCurrent: boolean;
  }>
) {
  let s3Service: S3Service | null = null;
  return Promise.all(
    rows.map(async (row) => {
      const fallbackUrl =
        extractUrl(row.thumbnailUrls?.medium) ||
        extractUrl(row.thumbnailUrls?.small) ||
        extractUrl(row.s3Url);

      let previewUrl: string | null = null;
      if (isImageMimeType(row.mimeType)) {
        if (row.s3Key) {
          try {
            s3Service = s3Service || new S3Service();
            previewUrl = await s3Service.getPresignedDownloadUrl(row.s3Key, 900, {
              contentType: row.mimeType || undefined,
              forceDownload: false,
            });
          } catch {
            previewUrl = fallbackUrl;
          }
        } else {
          previewUrl = fallbackUrl;
        }
      }

      const { s3Key: _s3Key, thumbnailUrls: _thumbnailUrls, ...rest } = row;
      return {
        ...rest,
        previewUrl,
      };
    })
  );
}

// GET /api/[tenant]/assets/[assetId]/versions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const { tenant, assetId } = await params;
    const tenantAccess = await requireTenantAccess(request, tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization } = tenantAccess;
    const existingAsset = await fetchAssetForVersioning({
      assetId,
      organizationId: organization.id,
    });
    if (!existingAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { data: versions, error: versionsError } = await (supabase as any)
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
          change_comment,
          effective_from,
          effective_to,
          created_by,
          created_at
        `
      )
      .eq("organization_id", organization.id)
      .eq("asset_id", assetId)
      .order("version_number", { ascending: false });

    if (versionsError) {
      console.error("GET /assets/[assetId]/versions DB query failed:", versionsError);
      return NextResponse.json({ error: "Failed to load version history" }, { status: 500 });
    }

    const mappedHistory = mapVersionHistoryRows({
      versions: (versions || []) as VersionRow[],
      currentAsset: existingAsset,
    });
    const history = await attachVersionPreviewUrls(mappedHistory);

    return NextResponse.json({
      data: history,
    });
  } catch (error) {
    console.error("GET /assets/[assetId]/versions failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/assets/[assetId]/versions
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

    const { planId } = await getOrganizationBillingLimits(organization.id);
    const maxUploadBytes =
      planId === "free" ? FREE_PLAN_MAX_UPLOAD_BYTES : DEFAULT_MAX_UPLOAD_BYTES;

    const canManageVersions = await canManageAssetVersions({
      userId,
      organizationId: organization.id,
    });
    if (!canManageVersions) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to version assets." },
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

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const changeCommentRaw = formData.get("changeComment");
    const changeComment =
      typeof changeCommentRaw === "string" && changeCommentRaw.trim().length > 0
        ? changeCommentRaw.trim().slice(0, 2000)
        : null;

    const effectiveFrom = normalizeOptionalDate(formData.get("effectiveFrom"));
    const effectiveTo = normalizeOptionalDate(formData.get("effectiveTo"));
    if (effectiveFrom && effectiveTo && new Date(effectiveTo) < new Date(effectiveFrom)) {
      return NextResponse.json(
        { error: "Effective end date must be on or after the start date." },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/avif",
      "image/tiff",
      "image/bmp",
      "image/heic",
      "image/heif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    const inferredMimeType = inferMimeTypeFromFilename(file.name);
    const providedMimeType = String(file.type || "").trim().toLowerCase();
    const effectiveMimeType = allowedTypes.includes(providedMimeType)
      ? providedMimeType
      : inferredMimeType || providedMimeType;

    if (!effectiveMimeType || !allowedTypes.includes(effectiveMimeType)) {
      return NextResponse.json(
        { error: `File type ${file.type || inferredMimeType || "unknown"} is not allowed` },
        { status: 400 }
      );
    }

    if (file.size > maxUploadBytes) {
      return NextResponse.json(
        {
          error: `File size exceeds your plan limit of ${Math.floor(
            maxUploadBytes / (1024 * 1024)
          )}MB`,
          code: "FILE_SIZE_LIMIT_EXCEEDED",
          limitBytes: maxUploadBytes,
        },
        { status: 400 }
      );
    }

    const s3Service = new S3Service();
    const s3Key = s3Service.generateAssetKey(organization.id, file.name);
    const publicUrl = s3Service.getPublicUrl(s3Key);
    const nextFileType = resolveAssetFileType(effectiveMimeType);

    try {
      const fileBuffer = await file.arrayBuffer();
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || "ap-southeast-2",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
          Body: Buffer.from(fileBuffer),
          ContentType: effectiveMimeType,
        })
      );
    } catch (s3Error) {
      console.error("POST /assets/[assetId]/versions S3 upload failed:", s3Error);
      return NextResponse.json(
        { error: "Failed to upload file to storage" },
        { status: 500 }
      );
    }

    const currentVersionNumber = Math.max(1, Number(existingAsset.current_version_number || 1));
    const nowIso = new Date().toISOString();
    const previousVersionInsert = {
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

    const { data: insertedPreviousVersion, error: insertVersionError } = await (supabase as any)
      .from("dam_asset_versions")
      .insert(previousVersionInsert)
      .select("id")
      .single();

    if (insertVersionError) {
      if (insertVersionError.code === "23505") {
        return NextResponse.json(
          { error: "This asset was versioned by another request. Refresh and try again." },
          { status: 409 }
        );
      }
      console.error("POST /assets/[assetId]/versions version insert failed:", insertVersionError);
      return NextResponse.json({ error: "Failed to create version snapshot" }, { status: 500 });
    }

    const { data: updatedAsset, error: updateError } = await (supabase as any)
      .from("dam_assets")
      .update({
        filename: file.name,
        original_filename: file.name,
        file_type: nextFileType,
        file_size: file.size,
        mime_type: effectiveMimeType,
        s3_key: s3Key,
        s3_url: publicUrl,
        thumbnail_urls: {},
        current_version_number: currentVersionNumber + 1,
        current_version_comment: changeComment,
        current_version_effective_from: effectiveFrom,
        current_version_effective_to: effectiveTo,
        current_version_changed_by: userId,
        current_version_changed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", assetId)
      .eq("organization_id", organization.id)
      .select()
      .single();

    if (updateError || !updatedAsset) {
      console.error("POST /assets/[assetId]/versions asset update failed:", updateError);
      await (supabase as any)
        .from("dam_asset_versions")
        .delete()
        .eq("id", insertedPreviousVersion.id)
        .eq("organization_id", organization.id);
      return NextResponse.json({ error: "Failed to update latest asset version" }, { status: 500 });
    }

    return NextResponse.json({
      data: updatedAsset,
      message: "Asset version created successfully",
    });
  } catch (error) {
    console.error("POST /assets/[assetId]/versions failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
