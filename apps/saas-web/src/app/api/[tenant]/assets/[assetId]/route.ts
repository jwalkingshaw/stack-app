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

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

async function requireAssetWritePermission(params: {
  userId: string;
  organizationId: string;
  permissionKey: string;
}) {
  const db = new DatabaseQueries(supabase as any);
  const authService = new AuthService(db);
  return evaluateScopedPermission({
    authService,
    userId: params.userId,
    organizationId: params.organizationId,
    permissionKey: params.permissionKey,
  });
}

// PATCH /api/[tenant]/assets/[assetId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantSlug = resolvedParams.tenant;
    const assetId = resolvedParams.assetId;
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

    const canEdit = await requireAssetWritePermission({
      userId,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetMetadataEdit,
    });
    if (!canEdit) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to edit asset metadata." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : null;
    const tags = Array.isArray(body.tags) ? body.tags : [];

    if (!filename) {
      return NextResponse.json({ error: "filename is required" }, { status: 400 });
    }

    const { data: existingAsset, error: existingAssetError } = await (supabase as any)
      .from("dam_assets")
      .select("id")
      .eq("id", assetId)
      .eq("organization_id", organization.id)
      .single();

    if (existingAssetError || !existingAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { data: updatedAsset, error: updateError } = await (supabase as any)
      .from("dam_assets")
      .update({
        filename,
        description,
        tags,
      })
      .eq("id", assetId)
      .eq("organization_id", organization.id)
      .select()
      .single();

    if (updateError) {
      console.error("PATCH /assets/[assetId] DB update failed:", updateError);
      return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
    }

    return NextResponse.json({
      data: updatedAsset,
      message: "Asset updated successfully",
    });
  } catch (error) {
    console.error("PATCH /assets/[assetId] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/assets/[assetId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantSlug = resolvedParams.tenant;
    const assetId = resolvedParams.assetId;
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

    const canDelete = await requireAssetWritePermission({
      userId,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetVersionManage,
    });
    if (!canDelete) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to delete assets." },
        { status: 403 }
      );
    }

    const { data: existingAsset, error: existingAssetError } = await (supabase as any)
      .from("dam_assets")
      .select("id")
      .eq("id", assetId)
      .eq("organization_id", organization.id)
      .single();

    if (existingAssetError || !existingAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { error: deleteError } = await (supabase as any)
      .from("dam_assets")
      .delete()
      .eq("id", assetId)
      .eq("organization_id", organization.id);

    if (deleteError) {
      console.error("DELETE /assets/[assetId] DB delete failed:", deleteError);
      return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Asset deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /assets/[assetId] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
