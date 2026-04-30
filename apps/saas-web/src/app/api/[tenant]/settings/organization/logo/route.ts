import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { AuthService } from "@stack-app/auth";
import { DatabaseQueries } from "@stack-app/database";
import { S3Service } from "@stack-app/storage";
import { getSupabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { applyOrganizationProfileUpdate } from "@/lib/organization-profile";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

function getFileExtension(mimeType: string, filename: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  const fallback = filename.split(".").pop()?.toLowerCase();
  return fallback === "png" || fallback === "jpg" || fallback === "jpeg"
    ? fallback === "jpeg"
      ? "jpg"
      : fallback
    : "png";
}

async function canManageOrganizationSettings(
  userId: string | undefined,
  organizationId: string
): Promise<boolean> {
  if (!userId) return false;
  const db = new DatabaseQueries(getSupabaseServer());
  const authService = new AuthService(db);
  const permissions = await authService.getUserPermissions(userId, organizationId);
  return permissions.is_owner || permissions.is_admin;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const tenantAccess = await requireTenantAccess(request, tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    const canManage = await canManageOrganizationSettings(userId, organization.id);
    if (!canManage) {
      return NextResponse.json(
        { error: "Only owners and admins can upload organization logos." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Logo file is required." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only PNG or JPG files are supported." },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Logo file must be 2MB or smaller." },
        { status: 400 }
      );
    }

    const extension = getFileExtension(file.type, file.name);
    const key = `organizations/${organization.id}/branding/logo-${Date.now()}-${randomUUID()}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const s3 = new S3Service();
    await s3.uploadObject(key, bytes, file.type);
    const logoUrl = s3.getPublicUrl(key);

    const { data: existingRow, error: existingError } = await getSupabaseServer()
      .from("organizations")
      .select("*")
      .eq("id", organization.id)
      .single();

    if (existingError || !existingRow) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      );
    }

    const profileUpdates = applyOrganizationProfileUpdate({
      existingRow: existingRow as Record<string, unknown>,
      logoUrl,
    });

    if (Object.keys(profileUpdates).length === 0) {
      return NextResponse.json(
        { error: "Organization schema does not currently support logo storage." },
        { status: 500 }
      );
    }

    const { error: updateError } = await getSupabaseServer()
      .from("organizations")
      .update(profileUpdates)
      .eq("id", organization.id);

    if (updateError) {
      console.error("Failed to persist organization logo:", updateError);
      return NextResponse.json(
        { error: "Failed to save organization logo." },
        { status: 500 }
      );
    }

    return NextResponse.json({ logoUrl });
  } catch (error) {
    console.error("Failed to upload organization logo:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
