import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { evaluateScopedPermission } from "@/lib/security-permissions";
import { S3Service } from "@tradetool/storage";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

// POST /api/[tenant]/assets/upload
// Hardened legacy upload endpoint with tenant + scoped permission checks.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantSlug = resolvedParams.tenant;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenantSlug, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const tenantAccess = await requireTenantAccess(request, tenantSlug);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = new DatabaseQueries(supabase as any);
    const authService = new AuthService(db);
    const canUpload = await evaluateScopedPermission({
      authService,
      userId,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetUpload,
    });

    if (!canUpload) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to upload assets." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const productLinkRaw = formData.get("productLink");
    const productLinkData = productLinkRaw
      ? JSON.parse(String(productLinkRaw))
      : null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} is not allowed` },
        { status: 400 }
      );
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${maxSize} bytes` },
        { status: 400 }
      );
    }

    const s3Service = new S3Service();
    const s3Key = s3Service.generateAssetKey(organization.id, file.name);

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
          ContentType: file.type,
        })
      );
    } catch (s3Error) {
      console.error("POST /assets/upload S3 upload failed:", s3Error);
      return NextResponse.json(
        { error: "Failed to upload file to storage" },
        { status: 500 }
      );
    }

    let assetType = "other";
    if (file.type.startsWith("image/")) assetType = "image";
    else if (file.type.startsWith("video/")) assetType = "video";
    else if (file.type.includes("pdf")) assetType = "document";

    const publicUrl = s3Service.getPublicUrl(s3Key);

    const { data: createdAsset, error: assetError } = await (supabase as any)
      .from("dam_assets")
      .insert({
        organization_id: organization.id,
        filename: file.name,
        original_filename: file.name,
        file_type: assetType,
        file_size: file.size,
        mime_type: file.type,
        s3_key: s3Key,
        s3_url: publicUrl,
        tags: [],
        created_by: userId,
      })
      .select()
      .single();

    if (assetError) {
      console.error("POST /assets/upload DB insert failed:", assetError);
      return NextResponse.json({ error: "Failed to save asset" }, { status: 500 });
    }

    if (productLinkData?.productId) {
      const { error: linkError } = await (supabase as any)
        .from("product_asset_links")
        .insert({
          organization_id: organization.id,
          product_id: productLinkData.productId,
          asset_id: createdAsset.id,
          asset_type: assetType,
          link_context: productLinkData.linkContext || "upload",
          confidence: productLinkData.confidence || 0.8,
          match_reason: "Manual linking during upload",
          link_type: "manual",
          created_by: userId,
        });

      if (linkError) {
        console.error("POST /assets/upload product link failed:", linkError);
      }
    }

    return NextResponse.json({
      data: createdAsset,
      message: "Asset uploaded successfully",
    });
  } catch (error) {
    console.error("POST /assets/upload failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
