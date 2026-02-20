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

interface BulkUpdateRequest {
  assetIds: string[];
  updates: {
    tags?: {
      mode: "replace" | "add" | "remove";
      values: string[];
    };
    description?: {
      mode: "replace" | "append";
      value: string;
    };
  };
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

// PATCH /api/[tenant]/assets/bulk-update
// Hardened legacy bulk update endpoint with tenant + scoped permission checks.
export async function PATCH(
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
    const canEditMetadata = await evaluateScopedPermission({
      authService,
      userId,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetMetadataEdit,
    });

    if (!canEditMetadata) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to edit asset metadata." },
        { status: 403 }
      );
    }

    const { assetIds, updates } = (await request.json()) as BulkUpdateRequest;

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json({ error: "No assets specified" }, { status: 400 });
    }
    if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates specified" }, { status: 400 });
    }

    const { data: existingAssets, error: assetCheckError } = await (supabase as any)
      .from("dam_assets")
      .select("id, tags, description")
      .in("id", assetIds)
      .eq("organization_id", organization.id);

    if (assetCheckError || !existingAssets) {
      return NextResponse.json({ error: "Failed to verify assets" }, { status: 500 });
    }

    if (existingAssets.length !== assetIds.length) {
      return NextResponse.json(
        {
          error: "Some assets not found or not accessible",
          found: existingAssets.length,
          requested: assetIds.length,
        },
        { status: 400 }
      );
    }

    const updatePromises = existingAssets.map(async (asset: any) => {
      const assetUpdates: any = {};

      if (updates.tags) {
        const currentTags: string[] = Array.isArray(asset.tags) ? asset.tags : [];
        const newTagValues: string[] = Array.isArray(updates.tags.values)
          ? updates.tags.values
          : [];

        switch (updates.tags.mode) {
          case "replace":
            assetUpdates.tags = newTagValues;
            break;
          case "add":
            assetUpdates.tags = Array.from(new Set([...currentTags, ...newTagValues]));
            break;
          case "remove":
            assetUpdates.tags = currentTags.filter((tag) => !newTagValues.includes(tag));
            break;
        }
      }

      if (updates.description) {
        const currentDescription = String(asset.description || "");
        const nextValue = String(updates.description.value || "");
        switch (updates.description.mode) {
          case "replace":
            assetUpdates.description = nextValue;
            break;
          case "append":
            assetUpdates.description = currentDescription
              ? `${currentDescription}\n${nextValue}`
              : nextValue;
            break;
        }
      }

      if (Object.keys(assetUpdates).length === 0) {
        return { success: true, assetId: asset.id, data: asset, error: null };
      }

      const { data, error } = await (supabase as any)
        .from("dam_assets")
        .update(assetUpdates)
        .eq("id", asset.id)
        .eq("organization_id", organization.id)
        .select()
        .single();

      return { success: !error, assetId: asset.id, data, error };
    });

    const results = await Promise.all(updatePromises);
    const successful = results.filter((row) => row.success);
    const failed = results.filter((row) => !row.success);

    return NextResponse.json({
      data: {
        successful: successful.length,
        failed: failed.length,
        total: results.length,
        results,
        updatedAssets: successful.map((row) => row.data),
      },
      message: `Bulk update completed: ${successful.length} successful, ${failed.length} failed`,
    });
  } catch (error) {
    console.error("PATCH /assets/bulk-update failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
